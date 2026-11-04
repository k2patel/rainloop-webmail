<?php

$root = dirname(__DIR__, 2);
$count = 0;
$failed = false;
$directories = new RecursiveCallbackFilterIterator(
    new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS),
    function ($file) {
        return !$file->isDir() || !in_array($file->getFilename(), ['.git', 'node_modules', 'static'], true);
    }
);
$files = new RecursiveIteratorIterator($directories);
foreach ($files as $file) {
    if ($file->getExtension() !== 'php' || strpos($file->getPathname(), '/.git/') !== false) {
        continue;
    }
    $process = proc_open([PHP_BINARY, '-l', $file->getPathname()], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    $output = stream_get_contents($pipes[1]) . stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    if (proc_close($process) !== 0) {
        fwrite(STDERR, $output);
        $failed = true;
    }
    ++$count;
}
echo "Checked $count PHP files on PHP " . PHP_VERSION . "\n";
exit($failed ? 1 : 0);
