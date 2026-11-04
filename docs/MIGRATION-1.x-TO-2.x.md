# RainLoop Webmail 1.x → 2.x: changes made on 2026-11-03

The archived 1.17.0 code is being continued as **RainLoop Webmail 2.0.0**, an
independently maintained fork. The maintainer actively uses the application and
is updating it for continued use. The RainLoop Webmail name stays, with a
prominent “forked from archived RainLoop” notice. Changes are maintained here;
they are not intended for merge-back into the archived upstream project.

This is a summary of the maintenance work, not an announcement that a public
release has been published or that every possible exploit has been eliminated.
For deployment steps, use [UPGRADING.md](UPGRADING.md).

## Upgrade an existing versioned installation

For the standard layout:

```text
index.php                         APP_VERSION = '1.17.0'
data/                             existing installation data
rainloop/v/1.17.0/                 existing code and assets
```

The maintained release uses the same entry-point mechanism. Back up the complete
installation, external data and contact database, and test a copy first. Then:

1. Add the complete packaged `rainloop/v/2.0.0/` beside `1.17.0/`.
2. Preserve existing `data/`, the installation salt, custom root `include.php`,
   external data mappings and `MULTIPLY`, if present. Do not overwrite private
   data with the archive's fresh data directory.
3. Install the new support tools, documentation and license notices as needed.
4. Replace the root `index.php` with the packaged one selecting `2.0.0`, after
   all the new version files are present.
5. Reload PHP-FPM/OPcache and browser tabs, then verify the real mail-server,
   contact-database, plugin and OpenPGP integrations before reopening service.

Old and new version directories can coexist. Restoring the old entry point
selects 1.17.0 again; restore the matching data/database backup too if the new
version made incompatible writes. The archived automatic updater is disabled.
The old ownCloud embedding is not an in-place upgrade target for this standalone fork.

## Security changes

| Area | Change and effect |
| --- | --- |
| Mailcow password-change plugin | Removed an unused shell command containing the raw new password, closing a command-injection path when that plugin was enabled. |
| Remote attachments and image proxy | Added a public-URL fetcher: HTTP/HTTPS only, ports 80/443, globally routable addresses, DNS pinning and redirect-by-redirect checks. Rejects HTTPS downgrade, proxy configurations that defeat address checks, and responses over 64 MiB. |
| CSRF and request methods | State-changing AJAX requires POST and a validated token. Upload/contact-import/append paths validate tokens too, and browser uploaders send them. Only the two cached message-read AJAX routes permit GET. |
| TLS | Enabled peer/hostname verification for affected HTTP/OAuth/password-change clients. New mail-server settings verify certificates and reject self-signed certificates; existing settings are preserved for review. Configure a private CA where needed. |
| Admin credentials | Disabled the historical default `admin` / `12345`, including unchanged legacy configurations. Added a CLI password-setting tool accepting a new password of at least 12 characters on standard input. |
| Credential decoding | Disabled PHP object instantiation when unserializing credential-array payloads. Existing array storage remains readable. |
| HTML email wrapping | Replaced marker/string substitution with DOM serialization. The checkout already contained an earlier randomized-marker mitigation for the historical RainLoop XSS issue. |
| Account/browser cache identity | Replaced password-derived MD5 with an opaque HMAC-SHA-256 identifier. This is a cache identity, not the stored admin-password verifier. Browser caches rebuild after the change. |
| Update channels | Disabled archived upstream executable update/plugin repositories. Explicit remote package downloads require verified HTTPS. Deploy reviewed code through the maintained build/deployment process. |
| Web-server examples | Hardened the Nginx example against private/internal paths, dotfiles and auxiliary PHP execution. Added a restrictive OpenBSD httpd example for the supplied deployment. The original `/data*` block already protected that data path. |

## PHP 8 support

The maintained code requires **PHP 8.2+**, with compatibility checks for PHP 8.2,
8.3, 8.4 and 8.5. The default runtime image uses PHP 8.4.

Compatibility work includes reserved-class naming, iterator/interface return types,
nullable signatures, parent-method signatures, removed `each()` usage, GD object
handling, deprecations around GD/cURL cleanup and dynamic properties. Bundled
Sabre, Predis, Imagine, PHPThumb and other affected code paths were adjusted.
Exception-log deduplication uses `WeakMap` rather than attaching dynamic properties
to exceptions.

Spyc was upgraded from 0.5.1 to release 0.6.3 and all translation YAML files are
covered by regression checks. Unused upstream PHPUnit development declarations
were removed from vendored runtime manifests; the application does not install
or ship those upstream test runners. See [dependency inventory](DEPENDENCIES.md).

These compatibility edits do not mean every bundled PHP library has been migrated
to its newest upstream major version. Application-specific forks and optional
plugins still require separate migration/integration review.

## JavaScript, editor and OpenPGP

- Migrated OpenPGP.js **2.6.2 → 6.3.2**, including asynchronous key parsing,
  generation, unlocking, signing, verification, encryption and decryption APIs.
  Verification awaits signature promises and displays text from the verified result.
- Preserved the existing armored arrays under `openpgp-public-keys` and
  `openpgp-private-keys`. Loading does not rewrite storage; unsupported entries
  remain when other keys are saved. Unlocking keeps stored private keys encrypted.
  Some obsolete keys/algorithms may be unusable under the current library.
- Replaced **CKEditor 4.6.2 with Jodit 4.19.4**, retaining the application's
  rich/plain-text, signature, read-only and resize/focus contracts. DOMPurify
  sanitizes editor content. Old CKEditor extensions are removed, including the
  ambiguously licensed QuickTable add-on.
- Replaced **LightGallery 1.2.21 with GLightbox 3.3.1** for image previews.
- Replaced the old GPL QR implementation with MIT-licensed **qrcode-generator 2.0.4**.
- Updated browser packages, including **jQuery 4.0.0, jQuery UI 1.14.2,
  Knockout 3.5.3, Autolinker 4.1.5, Moment 2.31.0, Underscore 1.13.8,
  js-cookie 3.0.8 and ifvisible.js 3.0.0**. Adapted changed cookie/activity APIs.
- Moved routing/key-handling libraries to pinned npm packages, retaining RainLoop's
  multiple-scope shortcuts and Insert alias. Updated the custom recipient widget
  for current jQuery UI lifecycle behavior and safer text/attribute construction.
- Removed Bootstrap 2 JavaScript in favor of small application adapters. Existing
  Bootstrap LESS layout styles remain. Replaced Modernizr, custom scrollbars,
  letter animations and wake-up helpers with native browser/application code;
  removed obsolete browser polyfills.

OpenPGP needs HTTPS or localhost and a modern browser with Web Crypto. Export keys
before changing browser origin/profile or deleting browser storage. Test your
custom themes and plugins against the changed editor, controls and markup.

## Build, packaging and containers

- Replaced the obsolete Gulp/Webpack 4 build with **Node 24.11+, Webpack 5,
  Babel 8, ESLint 10 and current Less/archive tools**. The legacy OpenSSL provider
  is no longer required. Dependencies are pinned and the lockfile is updated.
- Applied the published minimatch build-tool security fix through a documented
  dependency resolution; lint and archive generation exercise the changed version.
- The maintained build produces `rainloop-webmail-fork-2.0.0.zip` with the correct
  versioned directory/entry point, hidden protection files, CLI admin tool,
  documentation, third-party license inventory and a companion SHA-256 checksum. It does not build the removed
  legacy ownCloud integration. The old PHP 5 Debian-package script is retired;
  use the versioned ZIP or the distroless runtime deployment.
- Rebuilt PHP-FPM as a multi-stage **distroless Debian 13 nonroot** runtime, UID/GID
  65532. The final application runtime has no shell, package manager or build tools.
  PHP extensions and runtime shared libraries are collected in the build stage.
- Configured read-only application mounts, writable temporary storage, dropped
  capabilities and no-new-privileges. The PHP image contains the runtime; mount the
  built application separately.
- Added a dedicated `rainloop-data` Compose volume. Existing host data must be
  copied into it before starting the new service; the volume is not migrated
  automatically. See the upgrade guide for ownership and data-path requirements.
- Updated optional development tools to Node 24 and Transifex CLI 1.6.17, with
  a distroless nonroot translation image and verified binary checksums. Optional
  Docker Mailserver 16.0.1/MySQL 8.4 fixtures use an integration profile and new
  volumes; existing mail/database data is not automatically migrated.
- Separated maintained v2 artifact builds from archived 1.x publication. The workflow
  builds reviewable artifacts; it does not automatically publish an unreviewed release.

## Licensing

The application core keeps the original **MIT license and RainLoop copyright**.
That permits a maintained fork and redistribution with the required notice.
Third-party code keeps its own terms; the core license does not relicense it.

`THIRD_PARTY_NOTICES.txt` and generated `licenses/` metadata record the review.
The replacement editor, gallery and QR package use MIT terms. OpenPGP.js retains
LGPL-3.0-or-later obligations. The release includes its checksum-verified
preferred source archive and replacement/build instructions under `licenses/sources/`.
Some legacy PHP/asset license provenance remains incomplete. Keeping the original
name with a fork label is not a determination of trademark rights or endorsement.
Complete those release-license checks before public distribution.

## Validation and remaining work

The work adds PHP lint/class-loading/security regressions, mocked public-URL and
redirect checks, safe-default/CSRF bootstrap checks, OpenPGP tests and real Chromium
frontend checks. PHP compatibility and strict Semgrep PHP/security workflows are
configured in CI, alongside dependency-advisory and distroless checks. Workflow
actions are updated and pinned to fixed commits.

The archived-data upgrade fixture verifies the side-by-side 1.17.0 → packaged 2.x
entry-point switch, existing non-default admin password, user settings/signature,
and unchanged installation salt/test database. It does not contact a real mail server.

At the latest local scan, Semgrep reported no findings under the selected PHP
rules and the refreshed Yarn graph reported no advisories. Neither result proves
that every exploit has been removed. Native OpenBSD configuration validation,
authenticated IMAP/SMTP testing, enabled-plugin coverage, full PHP dependency
migrations and outstanding license provenance/source obligations remain separate
work before treating the fork as a fully reviewed production release.
