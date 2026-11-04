/* RainLoop Webmail (c) RainLoop Team | Licensed under MIT */
const fs = require('fs');
const path = require('path');

// These packages are copied into the browser assets or imported by the app.
const runtimePackages = [
	'autolinker',
	'classnames',
	'crossroads',
	'hasher',
	'signals',
	'keymaster',
	'dompurify',
	'emailjs-addressparser',
	'ifvisible.js',
	'jquery',
	'jquery-ui',
	'jodit',
	'glightbox',
	'jquery-backstretch',
	'jquery-migrate',
	'jquery-mousewheel',
	'jquery-scrollstop',
	'js-cookie',
	'knockout',
	'knockout-sortable',
	'lozad',
	'moment',
	'normalize.css',
	'openpgp',
	'opentip',
	'pikaday',
	'qrcode-generator',
	'simplestatemanager',
	'underscore'
];

function packageRoot(name, from) {
	let directory = from;
	while (true) {
		const candidate = path.join(directory, 'node_modules', name);
		if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
		const parent = path.dirname(directory);
		if (parent === directory) throw new Error('Missing runtime package: ' + name);
		directory = parent;
	}
}

exports.collectLicenses = function(destination) {
	const project = path.resolve(__dirname, '..'),
		output = path.join(destination, 'licenses'),
		seen = new Set(),
		inventory = [],
		licenseTexts = [];
	fs.mkdirSync(output, { recursive: true });
	function collect(name, from) {
		const directory = packageRoot(name, from);
		if (seen.has(directory)) return;
		seen.add(directory);
		const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
		const files = fs
			.readdirSync(directory)
			.filter(
				(file) =>
					/^(mit[-_])?(licen[cs]e|copying|notice)([.\-_]|$)/i.test(file) && fs.statSync(path.join(directory, file)).isFile()
			);
		for (const file of files) licenseTexts.push('===== ' + metadata.name + '@' + metadata.version + ' / ' + file + ' =====\n' + fs.readFileSync(path.join(directory, file), 'utf8'));
		if (name === 'qrcode-generator' && !files.length) {
			licenseTexts.push('===== qrcode-generator@' + metadata.version + ' / LICENSE =====\n' + fs.readFileSync(path.join(project, 'licenses/qrcode-generator-MIT.txt'), 'utf8'));
			files.push('LICENSE');
		}
		inventory.push({
			name: metadata.name,
			version: metadata.version,
			declaredLicense: metadata.license || metadata.licenses || null,
			licenseFiles: files,
			licenseTextFile: 'THIRD_PARTY_LICENSES.txt',
			reviewRequired: files.length === 0
		});
		for (const dependency of Object.keys(metadata.dependencies || {})) collect(dependency, directory);
	}
	for (const name of runtimePackages) collect(name, project);
	for (const file of fs.readdirSync(path.join(project, 'licenses'))) {
		fs.copyFileSync(path.join(project, 'licenses', file), path.join(output, file));
	}
	// Runtime PHP sources retain their own adjacent notices; collect only vendor
	// notices needed by the compiled browser assets, without duplicating trees.
	function bundled(directory) {
		for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
			const file = path.join(directory, entry.name);
			if (entry.isDirectory()) bundled(file);
			else if (/^(licen[cs]e|copying|notice)([.\-_]|$)/i.test(entry.name)) {
				licenseTexts.push('===== ' + path.relative(project, file) + ' =====\n' + fs.readFileSync(file, 'utf8'));
			}
		}
	}
	bundled(path.join(project, 'vendors'));
	fs.writeFileSync(path.join(output, 'THIRD_PARTY_LICENSES.txt'), licenseTexts.join('\n\n') + '\n');
	fs.writeFileSync(path.join(output, 'runtime-packages.json'), JSON.stringify(inventory, null, 2) + '\n');
};
