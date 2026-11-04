<?php

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

fwrite(STDERR, "Enter a new admin password on standard input (at least 12 characters):\n");
$password = rtrim((string) fgets(STDIN), "\r\n");
if (strlen($password) < 12) {
    fwrite(STDERR, "Password must contain at least 12 characters.\n");
    exit(1);
}

$_ENV['RAINLOOP_INCLUDE_AS_API'] = true;
require dirname(__DIR__) . '/index.php';
$config = RainLoop\Api::Config();
$config->SetPassword($password);
if (!$config->Save()) {
    fwrite(STDERR, "Could not save the admin password. Check data directory permissions.\n");
    exit(1);
}
fwrite(STDERR, "Admin password saved.\n");
