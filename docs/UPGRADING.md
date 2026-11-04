# Upgrading to the maintained RainLoop Webmail 2.x fork

Upstream RainLoop is archived. This fork is maintained independently for continued
use, including the maintainer's own deployment. It retains the RainLoop Webmail
name with a fork notice. Changes are not intended for merge-back upstream.
The maintained release line starts at 2.0.0.

Read the current [review status](../README.md#security-review-status-2026-11-03)
and [third-party notices](../THIRD_PARTY_NOTICES.txt) before deployment. Test the
upgrade against a copy of your installation first. This migration changes both
server code and browser assets; deploy them together. A standard versioned
installation can use the [manual in-place procedure](#manual-in-place-upgrade-with-version-directories)
after a backup and staging verification.

## Requirements

- PHP 8.2 or later. The default container uses PHP 8.4; checks also cover 8.2, 8.3 and 8.5.
- cURL, DOM/XML, iconv, mbstring, OpenSSL and PDO. Install the PDO driver used by
  your contact database. GD is needed for image processing. The provided runtime
  also includes intl, ZIP, PDO MySQL and PDO SQLite.
- A correctly configured CA trust store for HTTPS, IMAP and SMTP TLS.
- HTTPS and a modern browser with Web Crypto for OpenPGP. Legacy Internet Explorer
  and old browsers outside the supported library requirements are no longer targets.
- For source builds: Node 24.11 or later and Yarn Classic 1.22.22.

Keep your existing mail server and contact database. Upgrading webmail does not
upgrade those services or migrate their databases automatically.

## 1. Back up before running the new code

Take the installation out of service, or otherwise prevent writes while copying
its data. Keep a restorable backup outside the web root of:

- The complete old application and its entry-point `index.php`.
- The entire private `data/` tree, including `SALT.php`, `DATA.php`, all tenant
  directories, configurations, settings, contacts and plugin data. Do not regenerate
  the installation salt: it participates in decrypting existing stored values.
- A custom root `include.php`, an external data directory it points to, and the
  `MULTIPLY` file if used.
- The external contact database, using the database engine's backup tools.
- Web-server/PHP-FPM configuration, certificate/trust-store configuration and
  any locally modified plugins or themes.

Browser OpenPGP keys are separate from server backups. Export public keys and
password-protected private keys from each browser profile before changing its
origin or clearing browser storage. Keep the exact HTTPS scheme, host and port
if you want existing browser localStorage to remain available automatically.

## 2. Build or obtain a maintained 2.x artifact

Use a reviewed maintained-fork release, not the archived upstream updater.
For a source build from the intended checkout:

```sh
yarn install --frozen-lockfile --ignore-scripts --non-interactive
yarn build
```

The output is:

```text
build/dist/releases/webmail/2.0.1/rainloop-webmail-2.0.1.zip
```

The adjacent `.zip.sha256` file contains the archive's SHA-256 checksum. Verify
it before extracting; for example `sha256sum -c rainloop-webmail-2.0.1.zip.sha256`
on Linux, or compare `sha256`/`shasum -a 256` output on OpenBSD/macOS. A checksum
detects a mismatched or damaged download; it is not a maintainer signature.

Use the version named by the release when a later 2.x version is available.
The package contains a generated `index.php` and `rainloop/v/2.0.1/` tree,
with only `data/`, `rainloop/` and the root `index.php` at the top level. Required
notices/source are in `rainloop/v/2.0.1/app/licenses/`, and the admin-password
tool is in `rainloop/v/2.0.1/app/bin/`. Deployment/build documentation stays in
the GitHub repository. Development sources deliberately use `rainloop/v/0.0.0/`; do not rename that directory manually.
Node, Yarn and build tools are not required on the production PHP host.

## 3. Stage a separate installation

Extract the artifact into a new directory. Copy your backed-up private data and
required deployment customizations into the staged installation **before its first
request**. Preserve ownership and permissions appropriate to the PHP-FPM user.
If data is external, keep that mapping in the custom root `include.php` and stage
with a separate copy until you are ready to switch traffic.

Do not combine old and new PHP version trees or copy old generated JavaScript
onto the new installation. Keep the original installation intact for rollback.
Ensure the new entry point selects the packaged 2.x directory. Do not edit
passwords, encrypted settings or the installation salt during the copy.

Review third-party plugins individually for PHP 8 compatibility and new CSRF/TLS
requirements. Plugin repositories and the archived upstream updater are disabled;
review and deploy plugin code through your own deployment process. The legacy
ownCloud package is removed from the maintained 2.x build. An ownCloud embedding
requires a separate move to standalone webmail; do not apply this procedure as
an in-place ownCloud app upgrade.

## 4. Review changed defaults and behavior

**Admin access:** `admin` / `12345` is disabled even when found in an old
configuration. Existing non-default admin passwords remain usable. To set a new
password of at least 12 characters, run as the application user with access to
the intended data directory:

```sh
php rainloop/v/2.0.1/app/bin/set-admin-password.php
```

Supply the password on standard input. The CLI must use the same installation
and data-path configuration as PHP-FPM. For MULTIPLY, also set `HTTP_HOST` to the
intended tenant, for example `HTTP_HOST=mail.example.com php rainloop/v/2.0.1/app/bin/set-admin-password.php`.

**TLS:** new configurations verify mail-server certificates. Existing settings
are retained; review `[ssl] verify_certificate = On` and
`allow_self_signed = Off`. Use `cafile` for a private CA. OAuth and password-change
HTTPS clients also authenticate their peers; fix trust-store configuration instead
of disabling verification.

**Remote attachments and image proxy:** only public HTTP/HTTPS hosts on ports
80/443 are accepted. Redirects are checked, HTTPS downgrades are rejected and
responses are limited to 64 MiB. Private-network destinations and these download
paths with `curl_proxy` configured fail closed.

**Requests:** state-changing AJAX and uploads require POST and a valid CSRF token.
Deploy matching browser assets; stale tabs and third-party clients may need to
reload or update their upload integration.

**Editor and browser libraries:** CKEditor 4 is replaced with Jodit, the image
preview uses GLightbox, and jQuery/jQuery UI and other browser packages are updated.
The editor still supports rich text, literal plain text, signatures, tables,
images and read-only operation. Its toolbar and generated HTML may differ.
Native scrolling replaces the old custom scrollbar. Test your custom themes and
plugins against these changes rather than reusing old CKEditor add-ons.

**OpenPGP:** version 6.3 replaces the old 2.x API. Existing armored arrays remain
under `openpgp-public-keys` and `openpgp-private-keys` in browser localStorage.
Loading does not rewrite them; unsupported old entries are preserved when other
keys are saved. Some obsolete keys/algorithms may not be usable by the current
library. Confirm import/export, unlocking, signing, verification and decryption
with test mail before relying on the new installation. Stored encrypted private
keys remain encrypted when unlocked for an operation.

**Caches:** deploy the new assets and restart/reload PHP-FPM to invalidate OPcache.
Reload open browser tabs. The account/browser cache identifier changes to
HMAC-SHA-256, so expect client caches to rebuild. Keep backups of settings and keys;
do not clear all browser storage as a cache-cleaning shortcut.

## 5. Web-server setup

Only the application entry point should execute as PHP. Deny private data,
internal application code, dotfiles, test/build tooling and repository metadata.
The archive's `.htaccess` files are preserved, but Nginx and OpenBSD httpd do not
use them. Configure explicit server-side restrictions.

For the supplied OpenBSD deployment, adapt [the example](../build/openbsd/httpd.conf)
for `mail.k2patel.in`, keeping its first-match location ordering. The example
assumes httpd's `/var/www` chroot, `/htdocs/rainloop`, and `/run/php-fpm.sock`.
Keep PHP extensions and trusted CA files available inside the PHP chroot.
Validate on the actual OpenBSD release before reloading:

```sh
httpd -n -f /etc/httpd.conf
```

The original `/data*` restriction already protected that path. The new example
also limits which scripts/static paths are reachable. Its 25 MiB request limit
includes multipart overhead. The Nginx example is in `.docker/nginx/default.conf`.
Verify that a direct request for `/data/SALT.php`, `/.git/config` or internal
`/rainloop/v/2.0.1/app/` paths is denied before making the site available.

## 6. Distroless Docker deployments

Build the PHP runtime with:

```sh
docker build -t rainloop-php:2 .docker/php
```

The final PHP image is distroless, runs as UID/GID 65532, and has no shell or
package manager. It contains the runtime; mount the packaged application at
`/var/www` read-only, provide a writable `/tmp`, and mount writable private data
at `/var/www/data`. External data mappings must match the configured path.

Compose commands refer to a source checkout containing `docker-compose.yml`.
The runtime artifact can also be mounted in your own Compose/deployment definition.

The Compose setup introduces a named `rainloop-data` volume. An existing host
`./data` directory does not move into it automatically. Before starting the new
PHP service, copy the complete backed-up data tree into that volume with a
separate migration/helper environment and set its ownership to 65532:65532.
Use the actual Compose project's volume name, inspect the copied data, and do not
start with an empty volume against an existing installation. Keep the original
backup unchanged. Do not install tools into the distroless runtime to do the copy.

Run PHP tools by specifying their executable, rather than `docker exec ... sh`:

```sh
docker compose run --rm -T --entrypoint /usr/local/bin/php php tools/set-admin-password.php
```

This command uses the source checkout. If your container mounts the install ZIP
instead, use `rainloop/v/2.0.1/app/bin/set-admin-password.php` as the script path.
Supply the new password over standard input. A read-only application mount
prevents in-place updates; deploy a new artifact and reload/recreate the runtime
for each subsequent update.

## 7. Verify and switch traffic

On staging, run the [development checks](DEVELOPMENT.md), then test your real
integration: admin login, user login, folders, IMAP reads, SMTP send/reply/forward,
attachments and imports, contact database access, signatures, plain/rich-text
editing, 2FA QR setup, image previews, OpenPGP and each enabled plugin.
The automated suite does not provide credentials for or validate your mail server.

After staging passes, stop writes, take a final consistent backup/copy, switch
the web root and reload PHP-FPM. Verify private-path denial, the fork notice,
login and send/receive again. Retain the backups and old installation until you
have verified normal operation.

## Rollback

Stop the new installation and switch the web root and PHP runtime back to the
old deployment. Restore the matching pre-upgrade data and contact-database backup
if the new installation wrote to them; do not assume an older application can read
all new settings or database changes. Restore browser keys from your exports if
needed. Rolling back the application cannot undo mail already sent or server-side
mailbox changes; account for activity since cutover.

## Manual in-place upgrade with version directories

A standard deployed 1.17.0 installation has a root `index.php` defining
`APP_VERSION` as `1.17.0` and loads `rainloop/v/1.17.0/include.php`.
That layout supports installing the new code beside the old code under the same
web root, while preserving the existing data directory.

After the backup and staging checks above:

1. Stop application writes or put the site into maintenance mode.
2. Copy the complete packaged `rainloop/v/2.0.1/` directory into `rainloop/v/`,
   beside `1.17.0/`. Include its PHP, templates, themes and generated static assets.
   Do not overlay its contents onto the old `1.17.0/` tree.
3. Keep your existing `data/` directory (or external data mapping), root custom
   `include.php`, and `MULTIPLY` file. **Do not copy the archive's fresh `data/`
   directory over your installation.** Preserve `SALT.php` and `DATA.php`.
4. Keep the complete new version tree, including its protected `app/bin/` admin
   helper and `app/licenses/` notices/source. Deployment tools and documentation
   are available in the repository and are not installed at the web root.
5. Save a copy of the old root `index.php`. Replace it with the packaged 2.0.1 root
   `index.php` only after the new version tree is completely present. It defines
   `APP_VERSION` as `2.0.1`. With this specific entry-point format, changing that
   constant to `2.0.1` has the same routing effect, but prefer the packaged entry
   point so future entry-point changes are included. Never switch it before the
   new directory exists, or the application will return `[105] Missing version directory`.
6. Reload/restart PHP-FPM to invalidate OPcache, reload browser tabs, and verify
   login, send/receive, editing, contacts, plugins and OpenPGP. Switch traffic back
   only after those checks pass.

Replacing an entire installation by extracting the ZIP directly over it is not
the same procedure: it can overwrite data markers or local customizations. Extract
into a temporary directory first and copy only the intended paths. Subsequent
maintained 2.x upgrades follow the same version-directory/entry-point pattern.

Restoring the old entry point selects `1.17.0` again while that directory remains
present. If 2.x wrote settings or database changes, restore the matching backup as
described under rollback; changing `APP_VERSION` alone does not reverse data writes.

## Automated upgrade coverage

The upgrade test starts with archived 1.17.0 PHP source, creates an installation
with a non-default admin password and saved user settings/signature, adds the
packaged 2.x version beside 1.17.0, and replaces only the root entry point. It
checks that settings remain readable, the admin password works, the installation
salt and test database remain unchanged, and the legacy default password is
rejected. CI runs this fixture. It does not authenticate to IMAP/SMTP or exercise
every third-party plugin or contact-database schema.

## Optional development service changes

The source checkout's Compose file uses current development tools and separates
optional mail/database fixtures behind `--profile integration`. Its mail image is
Docker Mailserver 16.0.1 and its test database is MySQL 8.4. These services use new
`maildata-v2`, `mailstate-v2` and `mysql-v2` volumes; they do not consume or upgrade
the old integration volumes automatically. Set `RAINLOOP_DB_PASSWORD` before
starting the database fixture. Do not treat an empty new fixture as a migrated
production database or mailbox. Existing application domain/contact configuration
may still reference the old `mail`/`db` services; update it to your intended servers.

The prior MySQL 5.7 raw data directory cannot be mounted directly into MySQL 8.4.
Use a separately tested database migration/restore procedure; the official binary
upgrade path requires an intermediate MySQL 8.0 step. Mail-server upgrades also
need their own documented migration. This webmail upgrade does not perform either
operation. Keep existing servers and their backups independent of the webmail switch.

The optional Node build image now uses Node 24. The translation tool is the
Go-based Transifex CLI 1.6.17 in a nonroot distroless image, replacing the old Python
3.6 client. Its cache/home mount changes from `/root` to `/home/nonroot`; copy any
needed tool configuration separately and ensure the tool user can access it.

## OpenBSD: installed cURL is not loaded

The cURL startup requirement also existed in 1.x. Installing `php-curl` alone
does not ensure the serving PHP-FPM version has enabled it. For an installed
PHP 8.3/cURL 8.3 pair, enable the package's sample configuration if it is absent:

```sh
mkdir -p /etc/php-8.3
ln -s /etc/php-8.3.sample/curl.ini /etc/php-8.3/curl.ini
rcctl restart php83_fpm
```

If the file already exists, inspect it instead of overwriting it. Check the
active FPM service and its configuration if the error persists; CLI PHP may load
a different configuration:

```sh
rcctl ls started | grep php
php-8.3 --ini
php-8.3 -m | grep -i curl
```

Use the paths/service matching your installed PHP version. The `p0`/`p1` package
revision suffixes do not change the PHP 8.3 module directory.
