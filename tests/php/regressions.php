<?php

require __DIR__ . '/bootstrap.php';
error_reporting(E_ALL);
set_error_handler(function ($severity, $message, $file, $line) {
    if (error_reporting() & $severity) {
        throw new ErrorException($message, 0, $severity, $file, $line);
    }
});

$checks = 0;
function check($condition, $message)
{
    global $checks;
    if (!$condition) {
        throw new RuntimeException($message);
    }
    ++$checks;
}

// The exposed account identity is an opaque MAC, not a password verifier.
$domain = RainLoop\Model\Domain::NewInstance('example.com', 'imap.example.com', 993, 1, false,
    false, '', 4190, 0, 'smtp.example.com', 465, 1, false, true, false);
$account = RainLoop\Model\Account::NewInstance('test@example.com', 'test@example.com', 'test-password', $domain);
$identity = $account->Hash();
check(strlen($identity) === 64 && ctype_xdigit($identity), 'Account identity uses SHA-256 MAC');
check(hash_equals($identity, $account->Hash()), 'Account identity remains stable');
$account->SetPassword('changed-test-password');
check(!hash_equals($identity, $account->Hash()), 'Account identity invalidates credential caches');

// Existing credential cookies must keep working; decoded objects must never wake up.
class WakeupProbe
{
    public static $called = false;
    public function __wakeup() { self::$called = true; }
}
RainLoop\Utils::$Cookies = ['rlsession' => 'test-session', 'rltoken' => 'test-connection'];
$values = ['Email' => 'test@example.com', 'Password' => 'test-password', 'nested' => [0, false, '']];
foreach (['', 'Q'] as $suffix) {
    $encode = 'EncodeKeyValues' . $suffix;
    $decode = 'DecodeKeyValues' . $suffix;
    check(RainLoop\Utils::$decode(RainLoop\Utils::$encode($values)) === $values, 'Credential round trip ' . $suffix);
    $encrypt = 'EncryptString' . $suffix;
    $encoded = MailSo\Base\Utils::UrlSafeBase64Encode(RainLoop\Utils::$encrypt(
        serialize(['object' => new WakeupProbe()]), md5(APP_SALT)));
    RainLoop\Utils::$decode($encoded);
    check(!WakeupProbe::$called, 'Object injection ' . $suffix);
    check(RainLoop\Utils::$decode('invalid-token') === [], 'Malformed credential ' . $suffix);
}

// Ensure HTML serialization does not turn quoted text into executable attributes.
$payloads = [
    '<body title="___xxx___"><div title="x onclick=\'alert(1);//\' y">hello</div></body>',
    '<img src="x" onerror="alert(1)"><script>alert(1)</script>',
    '<a href="javascript:alert(1)">link</a><svg><a xlink:href="javascript:alert(1)">svg</a></svg>',
    '<body title="__wrp__"><div title="&quot; onmouseover=alert(1)">hello</div></body>'
];
foreach ($payloads as $payload) {
    $clean = MailSo\Base\HtmlUtils::ClearHtmlSimple($payload);
    $dom = new DOMDocument();
    @$dom->loadHTML($clean);
    check($dom->getElementsByTagName('script')->length === 0, 'Script survived sanitization');
    foreach ($dom->getElementsByTagName('*') as $element) {
        foreach ($element->attributes as $attribute) {
            check(stripos($attribute->name, 'on') !== 0, 'Event handler survived sanitization');
            if (in_array($attribute->name, ['href', 'src', 'xlink:href'], true)) {
                check($attribute->value === 'javascript:false' || !preg_match('/^\s*javascript:/i', $attribute->value),
                    'Executable JavaScript URL survived sanitization');
            }
        }
    }
}
$dom = new DOMDocument();
$dom->loadHTML('<html lang="en"><body title="___xxx___"><p title="a &quot; b">hello</p></body></html>');
$html = MailSo\Base\HtmlUtils::GetTextFromDom($dom);
check(strpos($html, 'title="___xxx___"') !== false && strpos($html, 'hello') !== false, 'DOM wrapper lost content');
check(strpos(MailSo\Base\HtmlUtils::GetTextFromDom($dom, false), 'data-x-div-type') === false, 'Unwrapped serialization');

// Reject local files, cloud metadata, private networks, parser tricks and unsafe ports.
foreach (['file:///etc/passwd', 'gopher://127.0.0.1:25/', 'http://127.0.0.1/', 'http://[::1]/',
    'http://[::ffff:127.0.0.1]/', 'http://10.0.0.1/', 'http://172.16.0.1/', 'http://192.168.1.1/',
    'http://169.254.169.254/latest/meta-data/', 'http://100.64.0.1/', 'http://2130706433/',
    'http://127.1/', 'http://0x7f000001/', 'http://user:pass@1.1.1.1/', 'http://1.1.1.1:25/',
    "http://1.1.1.1/\r\nHost: localhost", 'http://1.1.1.1\\@127.0.0.1/'] as $url) {
    check(MailSo\Base\PublicUrl::Resolve($url) === false, 'Unsafe public URL accepted: ' . $url);
}
check(MailSo\Base\PublicUrl::Resolve('https://1.1.1.1/test')['resolve'] === '1.1.1.1:443:1.1.1.1', 'Public address pinning');
check(MailSo\Base\PublicUrl::RedirectUrl('https://example.com/a/b', '/next') === 'https://example.com/next', 'Absolute redirect');
check(MailSo\Base\PublicUrl::RedirectUrl('https://example.com/a/b', 'next') === 'https://example.com/a/next', 'Relative redirect');
$file = tmpfile();
check(MailSo\Base\PublicUrl::SaveToFile('http://127.0.0.1/', $file) === false, 'Internal download accepted');
check(MailSo\Base\Http::NewInstance()->SaveUrlToFile('file:///etc/passwd', $file) === false, 'File protocol allowed');
fclose($file);

// Contact/calendar import and export must load their actual property implementations.
$card = SabreForRainLoop\VObject\Reader::read("BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Test User\r\nEMAIL:test@example.com\r\nEND:VCARD\r\n");
check(strpos($card->serialize(), 'test@example.com') !== false, 'vCard round trip');
$calendar = new SabreForRainLoop\VObject\Component\VCalendar();
$geo = $calendar->createProperty('GEO', [10.5, 20.5]);
check($geo instanceof SabreForRainLoop\VObject\Property\FloatValue, 'Calendar GEO property class');
check($geo->getParts() === [10.5, 20.5], 'Calendar GEO values');

$iterator = (new ReflectionClass(Predis\Collection\Iterator\SortedSetKey::class))->newInstanceWithoutConstructor();
$elements = new ReflectionProperty($iterator, 'elements');
$elements->setValue($iterator, ['zero' => 0, 'one' => 1]);
$extract = new ReflectionMethod($iterator, 'extractNext');
$extract->invoke($iterator);
check($iterator->key() === 'zero' && $iterator->current() === 0, 'Sorted-set first element');
$extract->invoke($iterator);
check($iterator->key() === 'one' && $iterator->current() === 1, 'Sorted-set next element');

if (extension_loaded('gd')) {
    $imagine = new Imagine\Gd\Imagine();
    $image = $imagine->create(new Imagine\Image\Box(16, 12));
    $png = $image->get('png');
    check(strncmp($png, "\x89PNG", 4) === 0, 'GD image creation');
    check($imagine->load($png)->getSize()->getWidth() === 16, 'GD image loading');
    $imageFile = tempnam(sys_get_temp_dir(), 'rainloop-image-');
    file_put_contents($imageFile, $png);
    $thumb = new PHPThumb\GD($imageFile);
    $thumb->resize(8, 8);
    check(strlen($thumb->getImageAsString()) > 0, 'PHPThumb resize');
    unset($thumb, $image);
    unlink($imageFile);
} else {
    echo "SKIP: GD image checks (extension unavailable)\n";
}

echo "$checks regression checks passed on PHP " . PHP_VERSION . "\n";
