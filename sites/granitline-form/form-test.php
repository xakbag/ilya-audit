<?php
// Тест обработчика на копии: встроенный сервер PHP + transport=file, реального получателя нет.
// Запуск: php form-test.php   (php в PATH или полный путь)
declare(strict_types=1);

$root = __DIR__;
$tmp = sys_get_temp_dir() . '/gl-form-test-' . bin2hex(random_bytes(3));
mkdir("$tmp/outbox", 0700, true);
mkdir("$tmp/state", 0700, true);
$cfgPath = "$tmp/config.php";
$writeCfg = function (array $over) use ($cfgPath, $tmp) {
    $cfg = array_merge([
        'enabled' => true, 'transport' => 'file',
        'recipient' => 'owner@example.invalid', 'sender' => 'site@example.invalid',
        'allowed_origins' => ['https://granitline.ru'], 'ip_salt' => 't',
        'ip_max' => 3, 'ip_window_sec' => 3600, 'day_max' => 100,
        'state_dir' => "$tmp/state", 'outbox_dir' => "$tmp/outbox",
    ], $over);
    file_put_contents($cfgPath, '<?php return ' . var_export($cfg, true) . ';');
};
$writeCfg([]);

$port = 18000 + random_int(0, 999);
putenv("GL_DELIVERY_CONFIG=$cfgPath");
$proc = proc_open([PHP_BINARY, '-S', "127.0.0.1:$port", '-t', $root], [1 => ['file', "$tmp/srv.log", 'a'], 2 => ['file', "$tmp/srv.log", 'a']], $pipes);
usleep(700000);

function post(int $port, $body, string $origin = 'https://granitline.ru', string $method = 'POST', string $ctype = 'application/json'): array
{
    $ctx = stream_context_create(['http' => [
        'method' => $method, 'ignore_errors' => true, 'timeout' => 5,
        'header' => "Content-Type: $ctype\r\nOrigin: $origin\r\n",
        'content' => is_string($body) ? $body : json_encode($body),
    ]]);
    $r = file_get_contents("http://127.0.0.1:$port/api/inquiries/index.php", false, $ctx);
    preg_match('#HTTP/\S+ (\d+)#', $http_response_header[0] ?? '', $m);
    return [(int)($m[1] ?? 0), json_decode((string)$r, true)];
}

$ok = ['phone' => '+7 (999) 123-45-67', 'comment' => "Двор 60 м²\nсрок — май", 'website' => '',
    'consent' => true, 'product' => 'Брусчатка габбро', 'productId' => 'stone-1',
    'source' => ['landing' => '/catalog/', 'utm_source' => 'yandex']];
$pass = 0; $fail = 0;
$check = function (string $name, array $res, int $code, bool $accepted) use (&$pass, &$fail) {
    $good = $res[0] === $code && (($res[1]['accepted'] ?? null) === $accepted);
    $good ? $pass++ : $fail++;
    printf("%s %-34s HTTP %d accepted=%s %s\n", $good ? 'OK  ' : 'FAIL', $name, $res[0],
        var_export($res[1]['accepted'] ?? null, true), $res[1]['error'] ?? '');
};
$outbox = fn() => count(glob("$tmp/outbox/*.eml"));

$check('валидная заявка', post($port, $ok), 200, true);
$check('письмо создано (1 шт)', [$outbox() === 1 ? 200 : 0, ['accepted' => true]], 200, true);
$check('honeypot заполнен', post($port, ['website' => 'http://spam'] + $ok), 400, false);
$check('плохой телефон', post($port, ['phone' => '12345'] + $ok), 422, false);
$check('нет согласия', post($port, ['consent' => false] + $ok), 422, false);
$check('чужой Origin', post($port, $ok, 'https://evil.example'), 403, false);
$check('GET', post($port, '', 'https://granitline.ru', 'GET'), 405, false);
$check('не JSON', post($port, 'phone=1', 'https://granitline.ru', 'POST', 'application/x-www-form-urlencoded'), 415, false);
$check('битый JSON', post($port, '{oops'), 400, false);
$check('заявка 2', post($port, $ok), 200, true);
$check('заявка 3', post($port, $ok), 200, true);
$check('лимит IP (4-я за час)', post($port, $ok), 429, false);
$check('писем ровно 3', [$outbox() === 3 ? 200 : 0, ['accepted' => true]], 200, true);

// Инъекция заголовков через товар не должна давать новых строк в Subject.
$writeCfg(['ip_max' => 100]);
post($port, ['product' => "X\r\nBcc: a@b.c"] + $ok);
$last = glob("$tmp/outbox/*.eml"); sort($last); $eml = file_get_contents(end($last));
$check('нет инъекции заголовков', [preg_match('/^Bcc:/mi', $eml) ? 0 : 200, ['accepted' => true]], 200, true);

$writeCfg(['ip_max' => 100, 'outbox_dir' => "$tmp/nope"]);
$check('сбой доставки → честная ошибка', post($port, $ok), 502, false);
$writeCfg(['ip_max' => 100, 'recipient' => 'OWNER_EMAIL_PLACEHOLDER']);
$check('нет получателя → 503', post($port, $ok), 503, false);
$writeCfg(['enabled' => false]);
$check('выключено → 503', post($port, $ok), 503, false);

proc_terminate($proc);
array_map('unlink', glob("$tmp/outbox/*") ?: []);
array_map('unlink', glob("$tmp/state/*") ?: []);
@rmdir("$tmp/outbox"); @rmdir("$tmp/state"); @unlink($cfgPath); @unlink("$tmp/srv.log"); @rmdir($tmp);
echo "\nИтого: $pass OK, $fail FAIL\n";
exit($fail ? 1 : 0);
