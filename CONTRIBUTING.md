# Contributing to the maintained RainLoop Webmail fork

This repository independently continues archived RainLoop. Submit changes to
[k2patel/rainloop-webmail](https://github.com/k2patel/rainloop-webmail); merge-back
into archived upstream is not planned. Preserve original attribution and the
fork notice.

Use Node 24.11+, Yarn Classic 1.22.22 and PHP 8.2–8.5. Do not install Gulp.
Follow [development and security checks](docs/DEVELOPMENT.md), including the
frontend/browser tests, PHP checks and security scan. Build release artifacts
with `yarn build`. The deployed PHP runtime is distroless; use the Node build
container or a local build environment for development tools.

When editing templates, disable `cache_system_data` in your disposable development
configuration. `use_app_debug_js` and `use_app_debug_css` select readable browser
assets. Do not commit real installation data, credentials, private keys or local
configuration.

Dependency updates must include API migration checks and license/notice updates.
Keep compatibility changes and documented breaking changes visible in the
[1.x → 2.x summary](docs/MIGRATION-1.x-TO-2.x.md) and upgrade guide.
