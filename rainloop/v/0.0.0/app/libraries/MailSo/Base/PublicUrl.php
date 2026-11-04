<?php

namespace MailSo\Base;

/** Downloads of URLs supplied by mail senders or webmail users. */
class PublicUrl
{
    public static function Resolve($url)
    {
        if (!is_string($url) || strlen($url) > 8192 || preg_match('/[\\x00-\\x20\\x7f\\\\]/', $url)) {
            return false;
        }
        if (substr($url, 0, 2) === '//') {
            $url = 'https:' . $url;
        }
        $parts = parse_url($url);
        if (!$parts || empty($parts['host']) || isset($parts['user']) || isset($parts['pass']) ||
            !in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true)) {
            return false;
        }
        $host = trim($parts['host'], '[]');
        $port = $parts['port'] ?? (strtolower($parts['scheme']) === 'https' ? 443 : 80);
        if (!in_array($port, [80, 443], true)) {
            return false;
        }
        if (filter_var($host, FILTER_VALIDATE_IP)) {
            $addresses = [$host];
        } else {
            if (!preg_match('/^[a-z0-9.-]+$/iD', $host)) {
                return false;
            }
            $addresses = @gethostbynamel($host) ?: [];
            foreach (@dns_get_record($host, DNS_AAAA) ?: [] as $record) {
                if (isset($record['ipv6'])) {
                    $addresses[] = $record['ipv6'];
                }
            }
        }
        if (!$addresses) {
            return false;
        }
        foreach ($addresses as $ip) {
            // GLOBAL_RANGE excludes loopback, private, link-local, shared and reserved ranges.
            if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_GLOBAL_RANGE)) {
                return false;
            }
        }
        $ip = $addresses[0];
        return ['url' => $url, 'host' => $host, 'port' => $port,
            'resolve' => $host . ':' . $port . ':' . (strpos($ip, ':') === false ? $ip : '[' . $ip . ']')];
    }

    public static function RedirectUrl($base, $location)
    {
        if (preg_match('/^[a-z][a-z0-9+.-]*:/i', $location)) {
            return $location;
        }
        $parts = parse_url($base);
        if (substr($location, 0, 2) === '//') {
            return $parts['scheme'] . ':' . $location;
        }
        $origin = $parts['scheme'] . '://' . $parts['host'] . (isset($parts['port']) ? ':' . $parts['port'] : '');
        if ($location === '' || $location[0] === '#') {
            return $base;
        }
        if ($location[0] === '?') {
            return $origin . ($parts['path'] ?? '/') . $location;
        }
        $path = $location[0] === '/' ? $location :
            substr($parts['path'] ?? '/', 0, strrpos($parts['path'] ?? '/', '/') + 1) . $location;
        return $origin . $path;
    }

    public static function SaveToFile($url, $file, $userAgent = '', &$contentType = '', &$code = 0,
        $logger = null, $timeout = 60, $proxy = '', $proxyAuth = '', $headers = [])
    {
        $code = 0;
        $contentType = '';
        // A proxy resolves destinations independently, defeating our DNS pinning.
        if (!is_resource($file) || $proxy !== '') {
            return false;
        }
        $deadline = microtime(true) + $timeout;
        for ($redirect = 0; $redirect <= 7; ++$redirect) {
            $target = self::Resolve($url);
            if (!$target || microtime(true) >= $deadline) {
                return false;
            }
            rewind($file);
            ftruncate($file, 0);
            $location = '';
            $size = 0;
            $curl = curl_init();
            $options = [
                CURLOPT_URL => $target['url'],
                CURLOPT_RESOLVE => [$target['resolve']],
                CURLOPT_PROXY => '',
                CURLOPT_NOPROXY => '*',
                CURLOPT_FOLLOWLOCATION => false,
                CURLOPT_SSL_VERIFYPEER => true,
                CURLOPT_SSL_VERIFYHOST => 2,
                CURLOPT_USERAGENT => $userAgent,
                CURLOPT_HTTPHEADER => $headers,
                CURLOPT_CONNECTTIMEOUT => min(10, max(1, (int) ($deadline - microtime(true)))),
                CURLOPT_TIMEOUT => max(1, (int) ($deadline - microtime(true))),
                CURLOPT_HEADERFUNCTION => function ($curl, $line) use (&$location) {
                    if (stripos($line, 'Location:') === 0) {
                        $location = trim(substr($line, 9));
                    }
                    return strlen($line);
                },
                CURLOPT_WRITEFUNCTION => function ($curl, $data) use ($file, &$size) {
                    $size += strlen($data);
                    return $size <= 64 * 1024 * 1024 ? fwrite($file, $data) : 0;
                }
            ];
            $options[defined('CURLOPT_PROTOCOLS_STR') ? CURLOPT_PROTOCOLS_STR : CURLOPT_PROTOCOLS] =
                defined('CURLOPT_PROTOCOLS_STR') ? 'http,https' : CURLPROTO_HTTP | CURLPROTO_HTTPS;
            curl_setopt_array($curl, $options);
            $ok = curl_exec($curl);
            $code = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
            $contentType = (string) curl_getinfo($curl, CURLINFO_CONTENT_TYPE);
            $curl = null;
            if (!$ok) {
                ftruncate($file, 0);
                return false;
            }
            if (in_array($code, [301, 302, 303, 307, 308], true) && $location !== '') {
                $next = self::RedirectUrl($target['url'], $location);
                if (stripos($target['url'], 'https:') === 0 && stripos($next, 'http:') === 0) {
                    return false;
                }
                $url = $next;
                $headers = []; // Never forward a bearer token to a redirect destination.
                continue;
            }
            return $code >= 200 && $code < 300;
        }
        return false;
    }

    public static function GetAsString($url, $userAgent = '', &$contentType = '', &$code = 0)
    {
        $file = ResourceRegistry::CreateMemoryResource();
        if (!self::SaveToFile($url, $file, $userAgent, $contentType, $code)) {
            return false;
        }
        rewind($file);
        return stream_get_contents($file);
    }
}
