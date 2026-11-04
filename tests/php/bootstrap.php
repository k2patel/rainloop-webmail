<?php

define('APP_VERSION_ROOT_PATH', dirname(__DIR__, 2) . '/rainloop/v/0.0.0/');
define('APP_START', microtime(true));
define('APP_SALT', 'test-only-installation-secret');
require APP_VERSION_ROOT_PATH . 'app/libraries/MailSo/MailSo.php';
require APP_VERSION_ROOT_PATH . 'app/libraries/RainLoop/Common/BackwardCapability/Account.php';
spl_autoload_register(function ($class) {
    $path = APP_VERSION_ROOT_PATH . 'app/libraries/' . str_replace('\\', '/', $class) . '.php';
    if (is_file($path)) {
        require $path;
    }
});
