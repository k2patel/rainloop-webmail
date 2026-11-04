<?php

require __DIR__ . '/bootstrap.php';
error_reporting(E_ALL);
$warnings = [];
$lastClass = '';
register_shutdown_function(function () use (&$lastClass) {
    if (error_get_last() && error_get_last()['type'] === E_ERROR) {
        fwrite(STDERR, "While loading $lastClass\n");
    }
});
set_error_handler(function ($severity, $message, $file, $line) use (&$warnings) {
    $warnings[] = "$file:$line $message";
    return true;
});
$root = APP_VERSION_ROOT_PATH . 'app/libraries/';
foreach (['RainLoop', 'MailSo', 'SabreForRainLoop', 'Predis', 'PHPThumb', 'Imagine'] as $namespace) {
    $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root . $namespace, FilesystemIterator::SKIP_DOTS));
    foreach ($files as $file) {
        $source = file_get_contents($file->getPathname());
        if (preg_match('/^namespace ([^;]+);/m', $source, $ns) && preg_match('/^(?:abstract |final )?(?:class|interface|trait) (\w+)/m', $source, $name)) {
            $class = $ns[1] . '\\' . $name[1];
            if ($class === 'RainLoop\\Common\\RainLoopFacebookRedirectLoginHelper') {
                continue; // Obsolete adapter for an unbundled Facebook SDK.
            }
            $lastClass = $class;
            class_exists($class) || interface_exists($class) || trait_exists($class);
        }
    }
}
if ($warnings) {
    fwrite(STDERR, implode("\n", $warnings) . "\n");
    exit(1);
}
echo "Bundled class loading passed on PHP " . PHP_VERSION . "\n";
