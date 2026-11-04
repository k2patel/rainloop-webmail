# Dependency inventory and development tooling

JavaScript packages are pinned in `package.json` and `yarn.lock`; CI performs a
full advisory audit. Runtime license metadata and the matching OpenPGP preferred
source are included in the installable ZIP.

PHP libraries are currently vendored under `rainloop/v/0.0.0/app/libraries/` and
loaded by the application loader. Some are application-specific compatibility
forks; this is not a Composer-installed root application. Their individual source
and notices remain available for review, and PHP checks exercise bundled loading.
Upstream migrations for all of these copies are not yet complete.

## Vendored Composer metadata

The Spyc and Mobile_Detect copies include runtime-only `composer.json` metadata.
Their unused upstream `require-dev` PHPUnit declarations were removed because
those upstream test suites and a PHPUnit installation are not shipped or used by
this application. This is a runtime/development boundary change, not a claim that
an old installed PHPUnit was patched. No Dependabot advisory ignore/dismissal is
used. Any future PHPUnit-based test tooling must be installed with a supported,
patched version and a lockfile in its actual development project.

Spyc was also upgraded from 0.5.1 to upstream release 0.6.3, commit
`4627c838b16550b666d15aeae1e5289dd5b77da0`. Its upstream source still labels the
file header 0.6.2; the pinned release/commit in its metadata records the source
actually vendored. Original MIT notices are retained. Tests parse every bundled
translation YAML file and exercise YAML roundtrips on the supported PHP versions.

The root `tests/php/` scripts do not require PHPUnit. The final PHP-FPM image has
no Composer or development test runner. Historical Dependabot runs keep their
original failure status; the dependency graph must refresh after metadata changes.
