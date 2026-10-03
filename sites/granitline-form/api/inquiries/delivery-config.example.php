<?php
// Образец. Боевой delivery-config.php лежит только на хостинге, в git не попадает.
return [
    'enabled' => false,                      // true — принимать заявки
    'transport' => 'mail',                   // 'mail' (PHP mail() хостинга) | 'file' (только тест)
    'recipient' => 'OWNER_EMAIL_PLACEHOLDER', // кому приходят заявки
    'sender' => 'SENDER_PLACEHOLDER@granitline.ru', // ящик на домене (для SPF/доставки)
    'allowed_origins' => ['https://granitline.ru'],
    'ip_salt' => 'RANDOM_SALT_PLACEHOLDER',
    'ip_max' => 5,              // заявок с одного IP за окно
    'ip_window_sec' => 3600,
    'day_max' => 100,           // всего заявок в сутки
    'state_dir' => '/home/USER/granitline-form-state', // вне www
    // 'outbox_dir' => '/tmp/outbox',       // только для transport=file
];
