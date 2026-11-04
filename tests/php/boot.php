<?php

// Exercise the production installer and API bootstrap without touching real data.
function __get_custom_data_full_path()
{
    return sys_get_temp_dir() . '/rainloop-boot-' . getmypid();
}
$_ENV['RAINLOOP_INCLUDE_AS_API'] = true;
$_SERVER['HTTP_HOST'] = 'localhost';
$_SERVER['REQUEST_METHOD'] = 'GET';
error_reporting(E_ALL);
set_error_handler(function ($severity, $message, $file, $line) {
    if (error_reporting() & $severity) {
        throw new ErrorException($message, 0, $severity, $file, $line);
    }
});
require dirname(__DIR__, 2) . '/index.php';
$actions = RainLoop\Api::Actions();
$config = $actions->Config();
if ($config->ValidatePassword('12345') || !$config->Get('ssl', 'verify_certificate') || $config->Get('ssl', 'allow_self_signed')) {
    throw new RuntimeException('Unsafe installation defaults');
}
$config->Set('security', 'admin_password', '12345');
if ($config->ValidatePassword('12345')) {
    throw new RuntimeException('Legacy default admin password is accepted');
}
$config->SetPassword('test-only-new-admin-password');
if (!$config->ValidatePassword('test-only-new-admin-password')) {
    throw new RuntimeException('Admin password hashing does not work');
}
$actions->AppData(false);
$http = MailSo\Base\Http::SingletonInstance();
$service = new RainLoop\ServiceActions($http, $actions);
foreach (['ClearTwoFactorInfo', 'AdminSettingsUpdate', 'Logout'] as $action) {
    $_POST = [];
    $service->SetPaths(['Ajax', '0', $action, '']);
    $response = json_decode($service->ServiceAjax(), true);
    if (($response['ErrorCode'] ?? null) !== RainLoop\Notifications::InvalidToken) {
        throw new RuntimeException('GET action was not blocked: ' . $action);
    }
}
$_SERVER['REQUEST_METHOD'] = 'POST';
$_POST = ['Action' => 'Version', 'Version' => APP_VERSION];
$response = json_decode($service->ServiceAjax(), true);
if (($response['ErrorCode'] ?? null) !== RainLoop\Notifications::InvalidToken) {
    throw new RuntimeException('Missing AJAX CSRF token was accepted');
}
$response = json_decode($service->ServiceUploadContacts(), true);
if (($response['ErrorCode'] ?? null) !== RainLoop\Notifications::InvalidToken) {
    throw new RuntimeException('Missing upload CSRF token was accepted');
}
$_POST['XToken'] = RainLoop\Utils::GetCsrfToken();
$response = json_decode($service->ServiceAjax(), true);
if (($response['Result'] ?? null) !== true) {
    throw new RuntimeException('Valid AJAX CSRF token was rejected');
}
$_POST['XToken'] = ['malformed-token'];
$response = json_decode($service->ServiceAjax(), true);
if (($response['ErrorCode'] ?? null) !== RainLoop\Notifications::InvalidToken) {
    throw new RuntimeException('Malformed CSRF token was accepted');
}
echo "Production bootstrap, safe defaults and CSRF checks passed on PHP " . PHP_VERSION . "\n";
