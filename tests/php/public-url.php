<?php

namespace MailSo\Base;

// Deterministic DNS and transport fixtures let us test redirects without exposing
// a private HTTP server or depending on external services.
$responses = [];
$requests = [];
function gethostbynamel($host) { return ['93.184.216.34']; }
function dns_get_record($host, $type) { return []; }
function curl_init() { return new \stdClass(); }
function curl_setopt_array($curl, $options) { $curl->options = $options; return true; }
function curl_exec($curl)
{
    global $responses, $requests;
    $requests[] = $curl->options;
    $curl->response = array_shift($responses);
    if (isset($curl->response['location'])) {
        $curl->options[CURLOPT_HEADERFUNCTION]($curl, 'Location: ' . $curl->response['location'] . "\r\n");
    }
    $body = $curl->response['body'] ?? '';
    return $curl->options[CURLOPT_WRITEFUNCTION]($curl, $body) === strlen($body);
}
function curl_getinfo($curl, $info)
{
    return $info === CURLINFO_HTTP_CODE ? $curl->response['code'] : 'image/png';
}
function curl_close($curl) {}

require __DIR__ . '/bootstrap.php';
error_reporting(E_ALL);
set_error_handler(function ($severity, $message, $file, $line) {
    if (error_reporting() & $severity) {
        throw new \ErrorException($message, 0, $severity, $file, $line);
    }
});
function ensure($condition, $message)
{
    if (!$condition) { throw new \RuntimeException($message); }
}
$file = tmpfile();
$type = '';
$code = 0;
$responses = [['code' => 200, 'body' => 'image-data']];
ensure(PublicUrl::SaveToFile('https://public.example/image', $file, '', $type, $code), 'Public download failed');
rewind($file);
ensure(stream_get_contents($file) === 'image-data', 'Download bytes lost');
ensure($requests[0][CURLOPT_RESOLVE] === ['public.example:443:93.184.216.34'], 'DNS is not pinned');
ensure($requests[0][CURLOPT_PROXY] === '' && $requests[0][CURLOPT_FOLLOWLOCATION] === false, 'Unsafe transport options');
ensure($requests[0][CURLOPT_SSL_VERIFYPEER] && $requests[0][CURLOPT_SSL_VERIFYHOST] === 2, 'TLS is not verified');

$requests = [];
$responses = [['code' => 302, 'location' => 'http://127.0.0.1/secret']];
ensure(!PublicUrl::SaveToFile('https://public.example/image', $file), 'Private redirect accepted');
ensure(count($requests) === 1, 'Private redirect was fetched');

$requests = [];
$responses = [['code' => 302, 'location' => 'https://other.example/next', 'body' => 'redirect-body'],
    ['code' => 200, 'body' => 'final-image']];
ensure(PublicUrl::SaveToFile('https://public.example/image', $file, '', $type, $code, null, 60, '', '',
    ['Authorization: Bearer test-only-token']), 'Public redirect failed');
ensure($requests[1][CURLOPT_HTTPHEADER] === [], 'Authorization leaked across redirect');
ensure($requests[1][CURLOPT_RESOLVE] === ['other.example:443:93.184.216.34'], 'Redirect DNS not pinned');
rewind($file);
ensure(stream_get_contents($file) === 'final-image', 'Redirect response contaminated output');
ensure(!PublicUrl::SaveToFile('https://public.example/image', $file, '', $type, $code, null, 60, 'proxy.example'),
    'Proxy bypasses public destination policy');
fclose($file);
echo "Public download and redirect checks passed on PHP " . PHP_VERSION . "\n";
