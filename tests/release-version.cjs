const assert = require('assert');
const pkg = require('../package.json');

assert(/^2\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version), 'The maintained line must use major version 2');
if (process.env.RELEASE_TAG) {
    assert.strictEqual(process.env.RELEASE_TAG, 'v' + pkg.version, 'Release tag must match package version');
}
assert.strictEqual(pkg.license, 'MIT', 'The application core retains its original license');
console.log('Maintained fork release version: ' + pkg.version);
