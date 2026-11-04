<?php

// Run twice, in separate processes: once with archived source, once with the artifact.
// Paths are supplied by the upgrade test runner and always point to temporary data.
if (PHP_SAPI !== 'cli' || $argc !== 4) {
    exit(1);
}
$phase = $argv[1];
$applicationRoot = $argv[2];
$fixtureRoot = $argv[3];
function __get_custom_data_full_path() { global $fixtureRoot; return $fixtureRoot . '/data'; }
$_ENV['RAINLOOP_INCLUDE_AS_API'] = true;
$_SERVER['HTTP_HOST'] = 'upgrade-test.example';
$_SERVER['REQUEST_METHOD'] = 'GET';
error_reporting($phase === 'create' ? E_ALL & ~E_DEPRECATED : E_ALL);
require $applicationRoot . '/index.php';
$actions = RainLoop\Api::Actions();
$config = $actions->Config();
$domain = RainLoop\Model\Domain::NewInstance('example.com', 'imap.example.com', 993, 1, false,
    false, '', 4190, 0, 'smtp.example.com', 465, 1, false, true, false);
$account = RainLoop\Model\Account::NewInstance('upgrade@example.com', 'upgrade@example.com', 'fixture-password', $domain);
$provider = $actions->SettingsProvider();
if ($phase === 'create') {
    $config->SetPassword('fixture-admin-nondefault-password');
    // Existing installations must retain explicit SSL settings for administrator review.
    $config->Set('ssl', 'verify_certificate', false);
    $config->Set('ssl', 'allow_self_signed', true);
    $config->Set('webmail', 'title', 'Existing installation');
    if (!$config->Save()) throw new RuntimeException('Could not create old configuration');
    $settings = new RainLoop\Settings();
    $settings->SetConf('DisplayName', 'Existing UTF-8 user — preserved');
    $settings->SetConf('Signature', ':HTML:<p>Existing signature</p>');
    if (!$provider->Save($account, $settings)) throw new RuntimeException('Could not create old user settings');
    $database = new PDO('sqlite:' . $fixtureRoot . '/contacts.sqlite');
    $database->exec('CREATE TABLE upgrade_contacts (email TEXT)');
    $database->exec("INSERT INTO upgrade_contacts VALUES ('existing@example.com')");
    file_put_contents($fixtureRoot . '/snapshot.json', json_encode([
        'salt' => hash_file('sha256', APP_DATA_FOLDER_PATH . 'SALT.php'),
        'database' => hash_file('sha256', $fixtureRoot . '/contacts.sqlite'),
    ]));
    echo "Archived 1.17.0 data fixture created\n";
} elseif ($phase === 'verify') {
    if (!str_starts_with(APP_VERSION, '2.')) throw new RuntimeException('Packaged entry point has wrong version');
    $snapshot = json_decode(file_get_contents($fixtureRoot . '/snapshot.json'), true);
    if (hash_file('sha256', APP_DATA_FOLDER_PATH . 'SALT.php') !== $snapshot['salt']) throw new RuntimeException('Installation salt changed');
    if (!$config->ValidatePassword('fixture-admin-nondefault-password')) throw new RuntimeException('Existing admin password no longer works');
    if ($config->Get('webmail', 'title') !== 'Existing installation') throw new RuntimeException('Existing config lost');
    if ($config->Get('ssl', 'verify_certificate') || !$config->Get('ssl', 'allow_self_signed')) throw new RuntimeException('Existing SSL settings silently changed');
    $settings = $provider->Load($account);
    if ($settings->GetConf('DisplayName') !== 'Existing UTF-8 user — preserved' || $settings->GetConf('Signature') !== ':HTML:<p>Existing signature</p>') {
        throw new RuntimeException('Existing user settings no longer readable');
    }
    if (hash_file('sha256', $fixtureRoot . '/contacts.sqlite') !== $snapshot['database']) throw new RuntimeException('Existing database changed during bootstrap');
    $config->Set('security', 'admin_password', '12345');
    if ($config->ValidatePassword('12345')) throw new RuntimeException('Legacy default admin accepted');
    echo "Packaged " . APP_VERSION . " reads archived data, admin password and user settings without changing salt/database\n";
} else throw new RuntimeException('Unknown phase');
