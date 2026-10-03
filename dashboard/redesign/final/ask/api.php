<?php
// ask/api.php — очередь вопросов доски ILYA CORE (B25, PULL-модель, без БД).
// Браузер (за Basic-входом доски): POST {question} -> {id};  GET ?id=... -> статус/ответ.
// Сервер (исходящий запрос, заголовок X-Ask-Token): POST ?action=pull&wait=N -> {question|null};
//                                                   POST ?action=answer {id,status,answer,source}.
// Данные и токен — вне веб-корня (ASK_DATA), права 600/700. Хранение 30 суток.
declare(strict_types=1);
error_reporting(0);
ini_set('display_errors', '0');

const MAX_LEN = 1000;
const MAX_ANSWER = 4000;
const RATE_WINDOW = 3600;
const RATE_IP = 20;          // вопросов в час с одного IP
const RATE_MIN_GAP = 5;      // секунд между вопросами с одного IP
const TTL = 2592000;         // 30 суток
const LEASE = 180;           // «отвечаю» дольше 3 мин без ответа -> обратно в очередь
const MAX_TRIES = 3;         // после 3 выдач без ответа -> «не смог»
const MAX_WAIT = 25;         // long-poll, сек
const MAX_QUEUED = 200;      // защита диска

function data_dir(): string {
    // выкладывается как www/ai-ilya.ru/ask-api.php (в корне доски, под её Basic-входом) -> ~/ask-data (не раздаётся веб-сервером)
    $d = getenv('ASK_DATA') ?: dirname(__DIR__, 2) . '/ask-data';
    if (!is_dir($d)) @mkdir($d, 0700, true);
    return $d;
}

function out(int $code, array $data): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function clean_text(string $s, int $max): string {
    $s = preg_replace('/[\x{00AD}\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2060}-\x{2069}\x{FEFF}]/u', '', $s) ?? '';
    $s = preg_replace('/<!--.*?(?:-->|$)/su', '', $s) ?? '';
    $s = strip_tags($s);
    $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $s) ?? '';
    $s = trim($s);
    return mb_substr($s, 0, $max, 'UTF-8');
}

function read_json_body(): array {
    $raw = file_get_contents('php://input', false, null, 0, 16384);
    $d = json_decode((string)$raw, true);
    return is_array($d) ? $d : [];
}

// Все изменения очереди — под одной блокировкой (файлов мало, нагрузка мизерная).
function with_lock(callable $fn) {
    $fh = fopen(data_dir() . '/.lock', 'c');
    flock($fh, LOCK_EX);
    try { return $fn(); } finally { flock($fh, LOCK_UN); fclose($fh); }
}

function qpath(string $id): string { return data_dir() . '/q-' . $id . '.json'; }

function load(string $id): ?array {
    $p = qpath($id);
    if (!is_file($p)) return null;
    $r = json_decode((string)file_get_contents($p), true);
    return is_array($r) ? $r : null;
}

function save(array $r): void {
    $p = qpath($r['id']);
    file_put_contents($p . '.tmp', json_encode($r, JSON_UNESCAPED_UNICODE));
    @chmod($p . '.tmp', 0600);
    rename($p . '.tmp', $p);
}

function all_ids(): array {
    $ids = [];
    foreach (glob(data_dir() . '/q-*.json') ?: [] as $f) {
        if (preg_match('/q-([a-f0-9]{16})\.json$/', $f, $m)) $ids[filemtime($f) . '-' . $m[1]] = $m[1];
    }
    ksort($ids);
    return array_values($ids);
}

function cleanup(): void {
    $cut = time() - TTL;
    foreach (glob(data_dir() . '/q-*.json') ?: [] as $f) if (filemtime($f) < $cut) @unlink($f);
}

function client_ip(): string { return (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown'); }

function rate_check(): void {
    $f = data_dir() . '/.rate.json';
    $now = time();
    $key = hash('sha256', client_ip());  // IP в открытом виде не храним
    $r = is_file($f) ? (json_decode((string)file_get_contents($f), true) ?: []) : [];
    foreach ($r as $k => $ts) {
        $r[$k] = array_values(array_filter((array)$ts, fn($t) => $t > $now - RATE_WINDOW));
        if (!$r[$k]) unset($r[$k]);
    }
    $mine = $r[$key] ?? [];
    if ($mine && $now - max($mine) < RATE_MIN_GAP) out(429, ['error' => 'too_fast']);
    if (count($mine) >= RATE_IP) out(429, ['error' => 'rate_limit']);
    $r[$key] = array_merge($mine, [$now]);
    file_put_contents($f, json_encode($r));
    @chmod($f, 0600);
}

function server_auth(): void {
    $tf = data_dir() . '/token.txt';
    if (!is_file($tf)) out(503, ['error' => 'token_not_configured']);
    $exp = trim((string)file_get_contents($tf));
    $got = (string)($_SERVER['HTTP_X_ASK_TOKEN'] ?? '');
    if (strlen($exp) < 32 || !hash_equals($exp, $got)) out(403, ['error' => 'forbidden']);
}

function public_view(array $r): array {
    return ['id' => $r['id'], 'status' => $r['status'], 'answer' => $r['answer'],
            'source' => $r['source'], 'created_at' => $r['created_at'], 'answered_at' => $r['answered_at']];
}

// ---- браузер ----
function post_question(): void {
    $d = read_json_body();
    $q = clean_text((string)($d['question'] ?? ''), MAX_LEN + 1);
    if ($q === '') out(400, ['error' => 'empty_question']);
    if (mb_strlen($q, 'UTF-8') > MAX_LEN) out(400, ['error' => 'question_too_long']);
    $rec = with_lock(function () use ($q) {
        rate_check();
        cleanup();
        if (count(all_ids()) >= MAX_QUEUED) out(503, ['error' => 'queue_full']);
        $r = ['id' => bin2hex(random_bytes(8)), 'question' => $q, 'status' => 'queued',
              'created_at' => gmdate('c'), 'leased_at' => null, 'tries' => 0,
              'answer' => null, 'source' => null, 'answered_at' => null];
        save($r);
        return $r;
    });
    out(200, ['id' => $rec['id'], 'status' => 'queued']);
}

function get_answer(): void {
    $id = (string)($_GET['id'] ?? '');
    if (!preg_match('/^[a-f0-9]{16}$/', $id)) out(400, ['error' => 'invalid_id']);
    $r = load($id);
    if (!$r) out(404, ['error' => 'not_found']);
    out(200, public_view($r));
}

// ---- сервер ----
function take_next(): ?array {
    return with_lock(function () {
        $now = time();
        foreach (all_ids() as $id) {
            $r = load($id);
            if (!$r) continue;
            if ($r['status'] === 'processing' && $now - (int)$r['leased_at'] > LEASE) {
                $r['status'] = $r['tries'] >= MAX_TRIES ? 'failed' : 'queued';
                if ($r['status'] === 'failed') {
                    $r['answer'] = 'Сервер не ответил за отведённое время.';
                    $r['source'] = 'очередь';
                    $r['answered_at'] = gmdate('c');
                }
                save($r);
            }
            if ($r['status'] !== 'queued') continue;
            $r['status'] = 'processing';
            $r['leased_at'] = $now;
            $r['tries'] = (int)$r['tries'] + 1;
            save($r);
            return $r;
        }
        return null;
    });
}

function server_pull(): void {
    server_auth();
    $wait = max(0, min(MAX_WAIT, (int)($_GET['wait'] ?? 0)));
    $end = time() + $wait;
    @set_time_limit($wait + 10);
    do {
        $r = take_next();
        if ($r) out(200, ['question' => ['id' => $r['id'], 'question' => $r['question'],
                                         'created_at' => $r['created_at']]]);
        if (time() >= $end) break;
        sleep(2);
    } while (true);
    @file_put_contents(data_dir() . '/.server-seen', gmdate('c'));
    out(200, ['question' => null]);
}

function server_answer(): void {
    server_auth();
    $d = read_json_body();
    $id = (string)($d['id'] ?? '');
    if (!preg_match('/^[a-f0-9]{16}$/', $id)) out(400, ['error' => 'invalid_id']);
    $status = in_array($d['status'] ?? '', ['answered', 'failed'], true) ? $d['status'] : 'failed';
    $ans = clean_text((string)($d['answer'] ?? ''), MAX_ANSWER);
    $src = clean_text((string)($d['source'] ?? ''), 300);
    $ok = with_lock(function () use ($id, $status, $ans, $src) {
        $r = load($id);
        if (!$r) return false;
        $r['status'] = $status;
        $r['answer'] = $ans;
        $r['source'] = $src;
        $r['answered_at'] = gmdate('c');
        save($r);
        return true;
    });
    if (!$ok) out(404, ['error' => 'not_found']);
    out(200, ['ok' => true]);
}

// ---- роутинг ----
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = (string)($_GET['action'] ?? '');
if ($method === 'POST' && $action === 'pull') server_pull();
elseif ($method === 'POST' && $action === 'answer') server_answer();
elseif ($method === 'POST' && $action === '') post_question();
elseif ($method === 'GET' && isset($_GET['id'])) get_answer();
elseif ($method === 'GET' && $action === 'ping') {
    $s = @file_get_contents(data_dir() . '/.server-seen');
    out(200, ['ok' => true, 'server_seen_at' => $s ?: null]);
}
else out(404, ['error' => 'not_found']);
