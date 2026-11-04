<?php

foreach (['/bin/sh', '/bin/bash', '/usr/bin/apt', '/usr/bin/apt-get', '/usr/bin/dpkg',
    '/usr/bin/curl', '/usr/local/bin/composer', '/usr/local/bin/phpunit', '/usr/bin/gcc'] as $path) {
    if (file_exists($path)) {
        throw new RuntimeException('Unexpected runtime tool: ' . $path);
    }
}
foreach (['curl', 'dom', 'iconv', 'mbstring', 'openssl', 'pdo_mysql', 'pdo_sqlite', 'intl', 'gd', 'zip'] as $extension) {
    if (!extension_loaded($extension)) {
        throw new RuntimeException('Missing extension: ' . $extension);
    }
}
if (posix_geteuid() !== 65532) {
    throw new RuntimeException('PHP is not running as the distroless nonroot user');
}
if (iconv('ISO-8859-1', 'UTF-8', "caf\xe9") !== "caf\xc3\xa9") {
    throw new RuntimeException('Encoding conversion failed');
}
echo "Distroless runtime checks passed on PHP " . PHP_VERSION . " (UID " . posix_geteuid() . ")\n";
