> **RainLoop Webmail 2.x — independently maintained fork**
>
> Forked from [RainLoop/rainloop-webmail](https://github.com/RainLoop/rainloop-webmail), which is archived.
>
> I actively use RainLoop and am maintaining this fork to upgrade its runtime and dependencies and address security issues.
>
> This is an independent continuation; these changes are not intended to be merged back into the archived upstream project.
>
> The RainLoop Webmail name is retained with this fork notice. The maintained release line starts at **2.0.0**; upstream 1.x remains in Git history.


<div align="center">
  <a href="https://github.com/k2patel/rainloop-webmail">
    <img width="200" height="200" src="assets/apple-touch-icon.png">
  </a>
  <br>
  <h1>RainLoop Webmail</h1>
  <br>
  <p>
    Simple, modern &amp; fast web-based email client.
  </p>
  <p>
    Modest system requirements, decent performance, simple installation and upgrade, no database required
    - all these make RainLoop Webmail a perfect choice for your email solution.
  </p>
  <h2></h2>
  <br>
</div>

Start with the [upgrade guide](docs/UPGRADING.md) when moving from archived 1.x.
Read the [1.x → 2.x change summary](docs/MIGRATION-1.x-TO-2.x.md).
See [documentation](docs/README.md) for deployment, development and review status.
Upstream documentation describes the archived application and may not apply to this fork.

## License

The application core retains its original [MIT license](LICENSE), which permits
modification and redistribution with the copyright and permission notice retained.
Third-party components keep their own licenses; see [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).
The license review still has outstanding asset-provenance and source-distribution
work; this is not blanket clearance for every bundled asset.

Copyright (c) 2022 Rainloop Team

## PHP runtime and checks

This branch requires PHP 8.2 or later and tests PHP 8.2, 8.3, 8.4 and 8.5.
Run `php tests/php/run.php` with cURL, DOM, iconv, mbstring, OpenSSL and
PDO SQLite installed. GD enables the image creation, load and resize checks.
The checks cover syntax, bundled class loading, credential decoding, HTML
sanitization, public URL downloads, contact/calendar parsing, safe installation
defaults and CSRF validation. They do not replace an authenticated IMAP/SMTP
integration test or a complete review of the JavaScript dependencies and plugins.

The default admin password is disabled, including the old `12345` password in
existing configurations. Set a password locally with
`php tools/set-admin-password.php`, entering it on standard input. Run this as
the application user with access to its data directory; the CLI must have the
same data-path configuration as PHP-FPM. In the installable ZIP, use
`php rainloop/v/2.0.1/app/bin/set-admin-password.php`; `tools/` is the source-checkout path. For MULTIPLY installations, set
`HTTP_HOST` to the intended tenant when running the command.

New installations verify mail-server certificates and reject self-signed
certificates by default. Existing configuration files retain their values:
set `[ssl] verify_certificate = On` and `allow_self_signed = Off`, and configure
`cafile` for your private CA if needed. Password-change HTTP clients now verify
certificates too. The archived upstream update and plugin repositories are disabled in this fork.
Deploy reviewed code through your build/deployment process. Any explicitly supplied
remote executable-package download must use verified HTTPS.

Uploads now require the same CSRF token as AJAX requests. Rebuild the frontend
when deploying these PHP changes (`yarn install --frozen-lockfile` followed by
`yarn build:frontend`); deploy the generated `rainloop/v/0.0.0/static` assets together
with the PHP files. `tests/build-frontend.sh` runs this build on Node 24.11 or later, Webpack 5 and Babel 8. The legacy OpenSSL provider is no longer needed.

User-supplied attachment and image URLs are limited to public HTTP/HTTPS hosts
on ports 80 and 443. Every redirect is checked, DNS is pinned, HTTPS downgrades
are rejected, and downloads are limited to 64 MiB. These downloads fail when
`curl_proxy` is configured because a proxy can resolve destinations independently
and defeat the address checks. Internal-network URL imports are intentionally
unavailable.

## Distroless PHP-FPM container

Build the PHP runtime with:

```sh
docker build -t rainloop-php .docker/php
# Optional: --build-arg PHP_VERSION=8.5
```

The final image uses `gcr.io/distroless/base-debian13:nonroot`, runs PHP-FPM as
UID/GID 65532, and contains the PHP runtime and extensions without a shell,
package manager, compiler, Composer or PHPUnit. Build tools remain in the build
stage. The image contains the runtime only; mount the built application at
`/var/www` read-only and give UID 65532 write access to `/var/www/data` and `/tmp`.
The development Compose configuration supplies a separate data volume; copy
existing data into that volume before switching an existing Compose deployment.
A read-only application mount also disables in-place core updates; deploy new
code and frontend assets through your build/deployment process.

Validate the image using `docker run --rm rainloop-php --test` and:

```sh
docker run --rm --read-only --tmpfs /tmp --entrypoint /usr/local/bin/php \
  -v "$PWD:/work:ro" -w /work rainloop-php tests/php/container.php
docker run --rm --read-only --tmpfs /tmp --entrypoint /usr/local/bin/php \
  -v "$PWD:/work:ro" -w /work rainloop-php tests/php/run.php
```

## OpenBSD httpd

[build/openbsd/httpd.conf](build/openbsd/httpd.conf) adapts the
`mail.k2patel.in` configuration. It permits ACME challenges, the application
entry point and generated static assets; private data, repository files and
other PHP scripts are denied. The supplied `/data*` block already protected
the original deployment's data directory. Keep more specific rules first:
[httpd uses the first matching location](https://man.openbsd.org/httpd.conf.5#location).
Paths and the FastCGI socket are relative to httpd's chroot.

The example has been checked against the manual; validate it on the target
OpenBSD release with `httpd -n -f /etc/httpd.conf` before reloading. PHP-FPM
should load the required extensions and trust-store files inside its chroot.
The 25 MiB request-body limit includes multipart overhead, so the largest
accepted attachment is slightly smaller than 25 MiB.

## Security review status (2026-11-03)

This pass addressed these concrete paths:

| Finding | Conditions and change |
| --- | --- |
| Shell command injection | An authenticated Mailcow user could put shell syntax in a new password when that plugin was enabled. The unused `doveadm pw` shell command has been removed. |
| Server-side URL fetching | Attachment imports accepted non-HTTP schemes and internal destinations. Public downloads now validate and pin every destination, including redirects. |
| CSRF | GET could dispatch state-changing AJAX actions, and upload/append endpoints lacked token validation. Only the two cached message reads allow GET; writes require POST and the configured CSRF token. |
| Executable update transport | Repository URLs used HTTP and cURL disabled certificate checks. Archived upstream update channels are disabled; explicitly supplied package downloads require verified HTTPS. |
| Default admin credentials | New installations and unchanged legacy configurations accepted `admin` / `12345`. The default is disabled and a local password-setting command is provided. |
| Private data exposure in the bundled Nginx example | Nginx ignored `.htaccess` and enabled directory listing. Private paths and direct execution of auxiliary PHP files are now blocked. The supplied OpenBSD configuration already denied `/data*`. |

Credential-array decoding now prevents PHP object instantiation. The HTML email
wrapper uses DOM serialization instead of string substitution; this removes the
serialization pattern behind the historical
[2022 RainLoop XSS advisory](https://www.sonarsource.com/blog/rainloop-emails-at-risk-due-to-code-flaw/).
This checkout already included a randomized-marker mitigation for that advisory.

OpenPGP was migrated from 2.6.2 to 6.3.2 using the
[current API](https://docs.openpgpjs.org/). Signing, verification, encryption,
decryption, import, export and deletion retain the existing armored keyring
storage format. Unlocking does not replace stored encrypted private keys.
Signature-verification promises are awaited, and displayed verified text comes
from the verification result. Unsupported old entries remain in storage when
other keys are saved. OpenPGP requires HTTPS (or localhost) and a modern browser
with Web Crypto. Run `node tests/openpgp.mjs` on Node 24; the browser harness is
`tests/openpgp-browser.html` when served locally. Tests use generated keys and
in-memory storage, never the user's real keyring. The frontend dependencies were refreshed, including jQuery 4, jQuery UI 1.14,
Knockout, Autolinker, Moment and Underscore. CKEditor 4 was replaced with Jodit;
LightGallery was replaced with GLightbox. The old QR library, Bootstrap 2 JavaScript,
Modernizr, custom scrollbar and letter-animation plugins, and obsolete polyfills
were replaced. Bootstrap's legacy LESS styles remain as the existing layout base.
The build uses current Webpack, Babel, ESLint, Less and archive tooling without Gulp.
`yarn test:browser` checks the editor, recipient input, sortable controls, dialogs,
previews, cookies, QR generation and OpenPGP in Chromium.

**Remaining review work:** the complete plugin catalogue and authenticated
IMAP/SMTP behavior still need integration testing. Some PHP libraries are
application-specific forks and still need separate upstream migrations; PHP 8
compatibility checks do not make them current upstream releases. The Semgrep PHP/security rules found and prompted fixes for OAuth TLS verification
and the password-derived account/cache identifier; it now uses HMAC-SHA-256.
The obsolete ownCloud integration was removed from the maintained line. The OpenBSD
example still needs native `httpd -n` validation. License provenance and
Corresponding Source obligations still need review before publication. A clean
package advisory scan or passing tests does not establish that the application
is free of exploits.
