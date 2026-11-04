# Development and security checks

Use Node 24.11+ and Yarn Classic 1.22.22. Install locked dependencies without
running package install scripts:

```sh
yarn install --frozen-lockfile --ignore-scripts --non-interactive
yarn lint
yarn build:frontend
yarn test:openpgp
yarn playwright install --with-deps chromium
yarn test:browser
yarn audit:dependencies
```

`yarn build` also packages the maintained 2.x release archive and its SHA-256
file. Release packaging downloads the pinned OpenPGP source archive, verifies
its digest, and includes it with build/replacement instructions. A verified
copy is cached under ignored `build/vendor-sources/` for subsequent builds. The build uses
Webpack 5, Babel 8, ESLint 10 and current Less/archive tooling; it does not require
Gulp or the legacy OpenSSL provider. Browser checks use generated test keys and
in-memory test storage. To use an installed Chrome, set `CHROME_PATH` when running
`yarn test:browser`. Do not run these tests against real account storage.

PHP lint, bundled class loading and security regression checks:

```sh
php tests/php/run.php
```

Use PHP 8.2–8.5 with cURL, DOM, iconv, mbstring, OpenSSL and PDO SQLite. GD adds
image checks. The workflow in `.github/workflows/php.yml` runs this matrix and
checks the distroless runtime, frontend build, browser behavior and dependencies.

The workflow in `.github/workflows/security.yml` runs the following scan (from
the source checkout) on pushes, pull requests and weekly:

```sh
docker run --rm -v "$PWD:/src" -w /src semgrep/semgrep:1.182.1 \
  semgrep scan --config p/php --config p/security-audit --include '*.php' \
  --metrics=off --disable-version-check --error --strict
```

The PHP security workflow runs Semgrep's public PHP/security rules locally on
the checkout. Reports are static-analysis findings, not proof of exploitability.
Review every finding and scan error; do not suppress an entire library to obtain
a green report. Package-advisory scans do not inspect custom vendored source.
The [main README](../README.md) records review limits and deployment requirements.

To test the manual in-place upgrade against the immutable archived baseline, build
a release and run from a full-history source checkout with PHP and Git available:

```sh
sh tests/upgrade-in-place.sh build/dist/releases/webmail/2.0.1/rainloop-webmail-2.0.1.zip
```

This uses disposable data and the packaged entry point. It must never be pointed
at a real installation directory. The PHP workflow runs the fixture after building
the frontend/release artifact.

Installable ZIPs contain only `index.php`, `data/`, and `rainloop/` at their root.
Build/deployment documentation stays in the repository. Required notices/source
and the CLI admin helper are packaged inside the protected versioned `app/` tree.
