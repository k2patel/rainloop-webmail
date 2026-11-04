<?php

foreach (['lint.php', 'probe.php', 'regressions.php', 'public-url.php', 'boot.php'] as $test) {
    $process = proc_open([PHP_BINARY, __DIR__ . '/' . $test], [STDIN, STDOUT, STDERR], $pipes);
    if (!is_resource($process) || proc_close($process) !== 0) {
        exit(1);
    }
}
