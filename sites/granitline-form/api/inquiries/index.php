<?php
// granitline.ru — приём заявки с формы «Рассчитать стоимость».
// Контракт фронта (чанк 548-*.js): POST JSON {phone, comment, website, consent,
// product, productId, variant, source{landing, referrer, utm_*}}; ответ
// {accepted: true} при успехе, иначе {accepted: false, error: "..."}.
// Данные заявки не сохраняются на хостинге: только письмо владельцу.
// В файл лимитов пишется лишь хэш IP и время.

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function respond(int $code, bool $accepted, string $error = ''): void
{
    http_response_code($code);
    $out = ['accepted' => $accepted];
    if ($error !== '') {
        $out['error'] = $error;
    }
    echo json_encode($out, JSON_UNESCAPED_UNICODE);
    exit;
}

// Одна строка без управляющих символов, обрезанная до $max символов.
function clean_line($v, int $max): string
{
    if (!is_string($v)) {
        return '';
    }
    $v = preg_replace('/[\x00-\x1F\x7F\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2066}-\x{2069}]+/u', ' ', $v) ?? '';
    return mb_substr(trim($v), 0, $max);
}

// Многострочный текст: переводы строк сохраняем, прочее управляющее убираем.
function clean_text($v, int $max): string
{
    if (!is_string($v)) {
        return '';
    }
    $v = str_replace("\r\n", "\n", $v);
    $v = preg_replace('/[\x00-\x09\x0B-\x1F\x7F\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2066}-\x{2069}]+/u', ' ', $v) ?? '';
    return mb_substr(trim($v), 0, $max);
}

$cfgFile = getenv('GL_DELIVERY_CONFIG') ?: __DIR__ . '/delivery-config.php';
$cfg = is_file($cfgFile) ? require $cfgFile : [];
if (!is_array($cfg)) {
    $cfg = [];
}

$FAIL = 'Не удалось отправить заявку. Позвоните или напишите нам, мы ответим.';

if (empty($cfg['enabled'])) {
    respond(503, false, 'Приём заявок пока недоступен. Данные не отправлены.');
}
$recipient = (string)($cfg['recipient'] ?? '');
$sender = (string)($cfg['sender'] ?? '');
$transport = (string)($cfg['transport'] ?? '');
$isAddr = fn(string $a) => filter_var($a, FILTER_VALIDATE_EMAIL) !== false;
if (!$isAddr($recipient) || !$isAddr($sender) || !in_array($transport, ['mail', 'file'], true)) {
    error_log('granitline-form: recipient/sender/transport not configured');
    respond(503, false, $FAIL);
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    respond(405, false, 'Метод не поддерживается.');
}

// Запросы только со своего сайта (браузер всегда шлёт Origin на POST fetch).
$allowed = (array)($cfg['allowed_origins'] ?? ['https://granitline.ru']);
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (!in_array($origin, $allowed, true)) {
    respond(403, false, $FAIL);
}

$ctype = strtolower($_SERVER['CONTENT_TYPE'] ?? '');
if (strpos($ctype, 'application/json') !== 0) {
    respond(415, false, $FAIL);
}
$raw = file_get_contents('php://input', false, null, 0, 16385);
if ($raw === false || strlen($raw) > 16384) {
    respond(413, false, $FAIL);
}
$in = json_decode($raw, true);
if (!is_array($in)) {
    respond(400, false, $FAIL);
}

// Honeypot: скрытое поле website заполняют только боты. Отвечаем честной ошибкой.
if (clean_line($in['website'] ?? '', 200) !== '') {
    respond(400, false, $FAIL);
}

$phone = clean_line($in['phone'] ?? '', 22);
$digits = preg_replace('/\D/', '', $phone) ?? '';
if (strlen($digits) !== 11 || !in_array($digits[0], ['7', '8'], true)) {
    respond(422, false, 'Укажите телефон в формате +7 (999) 123-45-67.');
}
if (($in['consent'] ?? false) !== true) {
    respond(422, false, 'Подтвердите согласие на обработку данных.');
}
$phoneNorm = '+7' . substr($digits, 1);
$comment = clean_text($in['comment'] ?? '', 2000);
$product = clean_line($in['product'] ?? '', 200);
$productId = clean_line($in['productId'] ?? '', 64);
$variant = clean_line($in['variant'] ?? '', 120);
$src = is_array($in['source'] ?? null) ? $in['source'] : [];
$srcLines = [];
foreach (['landing', 'referrer', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as $k) {
    $v = clean_line($src[$k] ?? '', 160);
    if ($v !== '') {
        $srcLines[] = "$k: $v";
    }
}

// Лимит: на IP и общий в сутки. Храним только соль+хэш IP и метки времени.
$stateDir = (string)($cfg['state_dir'] ?? (sys_get_temp_dir() . '/granitline-form'));
if (!is_dir($stateDir) && !@mkdir($stateDir, 0700, true)) {
    respond(500, false, $FAIL);
}
$now = time();
$ipHash = hash('sha256', (string)($cfg['ip_salt'] ?? 'granitline') . '|' . ($_SERVER['REMOTE_ADDR'] ?? ''));
$fh = @fopen($stateDir . '/rate.json', 'c+');
if ($fh === false || !flock($fh, LOCK_EX)) {
    respond(500, false, $FAIL);
}
$state = json_decode(stream_get_contents($fh) ?: '[]', true);
if (!is_array($state)) {
    $state = [];
}
$ipWindow = (int)($cfg['ip_window_sec'] ?? 3600);
$ipMax = (int)($cfg['ip_max'] ?? 5);
$dayMax = (int)($cfg['day_max'] ?? 100);
$all = array_values(array_filter((array)($state['all'] ?? []), fn($t) => is_int($t) && $t > $now - 86400));
$ips = [];
foreach ((array)($state['ip'] ?? []) as $h => $ts) {
    $ts = array_values(array_filter((array)$ts, fn($t) => is_int($t) && $t > $now - $ipWindow));
    if ($ts) {
        $ips[$h] = $ts;
    }
}
$limited = count($ips[$ipHash] ?? []) >= $ipMax || count($all) >= $dayMax;
if (!$limited) {
    $ips[$ipHash][] = $now;
    $all[] = $now;
}
ftruncate($fh, 0);
rewind($fh);
fwrite($fh, json_encode(['ip' => $ips, 'all' => $all]));
fflush($fh);
flock($fh, LOCK_UN);
fclose($fh);
if ($limited) {
    respond(429, false, 'Слишком много заявок подряд. Позвоните или напишите нам.');
}

// Письмо владельцу.
$lines = [
    'Новая заявка с сайта granitline.ru',
    '',
    'Телефон: ' . $phoneNorm,
    'Товар: ' . ($product !== '' ? $product : '—') . ($productId !== '' ? " ($productId)" : ''),
];
if ($variant !== '') {
    $lines[] = 'Вариант: ' . $variant;
}
$lines[] = '';
$lines[] = 'Комментарий:';
$lines[] = $comment !== '' ? $comment : '—';
if ($srcLines) {
    $lines[] = '';
    $lines[] = 'Источник:';
    array_push($lines, ...$srcLines);
}
$lines[] = '';
$lines[] = 'Время (МСК): ' . (new DateTime('now', new DateTimeZone('Europe/Moscow')))->format('d.m.Y H:i');
$body = implode("\r\n", $lines);
$subject = 'Заявка с сайта: ' . ($product !== '' ? $product : 'расчёт стоимости');

$sent = false;
if ($transport === 'mail') {
    $headers = implode("\r\n", [
        'From: ГранитЛайн <' . $sender . '>',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
    ]);
    $sent = mail(
        $recipient,
        mb_encode_mimeheader($subject, 'UTF-8', 'B'),
        $body,
        $headers,
        '-f' . $sender
    );
} elseif ($transport === 'file') {
    // Только для теста: письмо пишется в каталог outbox_dir, наружу ничего не уходит.
    $dir = (string)($cfg['outbox_dir'] ?? '');
    if ($dir !== '' && is_dir($dir)) {
        $name = $dir . '/' . date('Ymd-His') . '-' . bin2hex(random_bytes(3)) . '.eml';
        $sent = file_put_contents($name, "To: $recipient\r\nFrom: $sender\r\nSubject: $subject\r\n\r\n$body") !== false;
    }
}

if (!$sent) {
    error_log('granitline-form: delivery failed, transport=' . $transport);
    respond(502, false, $FAIL);
}
respond(200, true);
