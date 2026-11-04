# Corresponding library source in the installable release

`openpgpjs-6.3.2-source.tar.gz` is the unmodified preferred source from the
OpenPGP.js `v6.3.2` tag. Its URL, version and SHA-256 digest are recorded in
`../sources.json` in the release. It includes `src/`, the upstream license,
package manifests and build configuration. Keep those notices with the source.

OpenPGP.js is shipped as the separate
`rainloop/v/2.0.0/static/js/min/openpgp.min.js` script, not compiled into the
application bundle. You can replace it with a compatible modified build without
modifying application code. Update the version directory for later releases;
clear the browser cache after replacing the script. With the read-only Docker
mount, change the application artifact on the host and redeploy that mount.

To build a modified library, extract the source into a development directory,
follow its own README and package/build scripts, install its declared build
dependencies, and run `npm run build`. The package supplies its browser IIFE
under `dist/openpgp.min.js`; deploy that file at the path above. The library and
build dependencies keep their own license terms. The PHP production image does
not include Node or build tools.

The RainLoop integration changes are in this maintained fork's source tree,
particularly `dev/Common/OpenPgp.js` and the OpenPGP view/store adapters. Other
modified LGPL PHP libraries are distributed in preferred PHP source form under
the packaged `rainloop/v/<version>/app/libraries/` directory with their notices.
See `THIRD_PARTY_NOTICES.txt` for the rest of the component/asset review limits.
