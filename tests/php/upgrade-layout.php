<?php

if (PHP_SAPI !== 'cli' || $argc !== 3) exit(1);
$root = realpath($argv[1]);
$artifact = realpath($argv[2]);
if (!$artifact) throw new RuntimeException('Release ZIP does not exist: ' . $argv[2]);
if (!$root || json_decode(file_get_contents($root . '/package.json'), true)['version'] !== '1.17.0') {
    throw new RuntimeException('Expected a disposable archived 1.17.0 source checkout and a release ZIP');
}
rename($root . '/rainloop/v/0.0.0', $root . '/rainloop/v/1.17.0');
file_put_contents($root . '/index.php', str_replace("'APP_VERSION', '0.0.0'", "'APP_VERSION', '1.17.0'", file_get_contents($root . '/index.php')));
function phase($name, $root) {
    $process = proc_open([PHP_BINARY, __DIR__ . '/upgrade-fixture.php', $name, $root, $root],
        [0 => ['pipe', 'r'], 1 => STDOUT, 2 => STDERR], $pipes);
    if (!is_resource($process)) throw new RuntimeException('Cannot start upgrade fixture');
    fclose($pipes[0]);
    if (proc_close($process) !== 0) throw new RuntimeException('Upgrade phase failed: ' . $name);
}
phase('create', $root);
$zip = new ZipArchive();
if ($zip->open($artifact) !== true) throw new RuntimeException('Cannot open release artifact');
$index = $zip->getFromName('index.php');
if (!preg_match("/'APP_VERSION', '(2\\.[0-9]+\\.[0-9]+)'/", $index, $match)) throw new RuntimeException('Wrong release version');
$version = $match[1];
$prefix = 'rainloop/v/' . $version . '/';
for ($i = 0; $i < $zip->numFiles; ++$i) {
    $name = $zip->getNameIndex($i);
    if (str_contains($name, '../') || str_contains($name, '\\') || str_starts_with($name, '/')) throw new RuntimeException('Unsafe artifact path');
    // Copy only the new version; intentionally never extract the package's data/.
    if (!str_starts_with($name, $prefix)) continue;
    $destination = $root . '/' . $name;
    if (str_ends_with($name, '/')) {
        if (!is_dir($destination)) mkdir($destination, 0755, true);
    } else {
        if (!is_dir(dirname($destination))) mkdir(dirname($destination), 0755, true);
        file_put_contents($destination, $zip->getFromIndex($i));
    }
}
copy($root . '/index.php', $root . '/index.php.before-v2');
file_put_contents($root . '/index.php', $index);
$zip->close();
if (!is_dir($root . '/rainloop/v/1.17.0') || !is_dir($root . '/rainloop/v/' . $version)) throw new RuntimeException('Side-by-side version trees missing');
phase('verify', $root);
echo "Manual in-place version-directory upgrade passed\n";
