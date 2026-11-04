<?php
require __DIR__ . '/bootstrap.php';
require APP_VERSION_ROOT_PATH . 'app/libraries/spyc/Spyc.php';
error_reporting(E_ALL);
set_error_handler(function ($severity, $message, $file, $line) {
    if (error_reporting() & $severity) throw new ErrorException($message, 0, $severity, $file, $line);
});
$count = 0;
$iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator(APP_VERSION_ROOT_PATH . 'app/localization', FilesystemIterator::SKIP_DOTS));
foreach ($iterator as $file) {
    if ($file->getExtension() !== 'yml') continue;
    $parsed = spyc_load(file_get_contents($file->getPathname()));
    if (!is_array($parsed) || !$parsed) throw new RuntimeException('Translation YAML failed: ' . $file->getPathname());
    $merged = [];
    RainLoop\Utils::ReadAndAddLang($file->getPathname(), $merged);
    if (!$merged) throw new RuntimeException('Application localization failed: ' . $file->getPathname());
    ++$count;
}
$values = ['message' => 'Hello — world', 'enabled' => true, 'items' => ['first', 'second']];
if (spyc_load(spyc_dump($values)) !== $values) throw new RuntimeException('YAML scalar/list roundtrip failed');
echo "$count translation YAML files and YAML roundtrip passed on PHP " . PHP_VERSION . "\n";
