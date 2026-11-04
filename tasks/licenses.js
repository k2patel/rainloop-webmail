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
		inventory = [];
	fs.mkdirSync(output, { recursive: true });
	function collect(name, from) {
		const directory = packageRoot(name, from);
		if (seen.has(directory)) return;
		seen.add(directory);
		const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8')),
			target = path.join(output, 'npm', metadata.name + '-' + metadata.version);
		fs.mkdirSync(target, { recursive: true });
		const files = fs
			.readdirSync(directory)
			.filter(
				(file) =>
					/^(mit[-_])?(licen[cs]e|copying|notice)([.\-_]|$)/i.test(file) && fs.statSync(path.join(directory, file)).isFile()
			);
		for (const file of files) fs.copyFileSync(path.join(directory, file), path.join(target, file));
		if (name === 'qrcode-generator' && !files.length) {
			fs.copyFileSync(path.join(project, 'licenses/qrcode-generator-MIT.txt'), path.join(target, 'LICENSE'));
			files.push('LICENSE');
		}
		fs.copyFileSync(path.join(directory, 'package.json'), path.join(target, 'package.json'));
		inventory.push({
			name: metadata.name,
			version: metadata.version,
			declaredLicense: metadata.license || metadata.licenses || null,
			licenseFiles: files,
			reviewRequired: files.length === 0
		});
		for (const dependency of Object.keys(metadata.dependencies || {})) collect(dependency, directory);
	}
	for (const name of runtimePackages) collect(name, project);
	for (const file of fs.readdirSync(path.join(project, 'licenses'))) {
		fs.copyFileSync(path.join(project, 'licenses', file), path.join(output, file));
	}
	function bundled(directory) {
		for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
			const file = path.join(directory, entry.name);
			if (entry.isDirectory()) bundled(file);
			else if (/^(licen[cs]e|copying|notice|gnu-lgpl)([.\-_]|$)/i.test(entry.name)) {
				const target = path.join(output, 'bundled', path.relative(project, file));
				fs.mkdirSync(path.dirname(target), { recursive: true });
				fs.copyFileSync(file, target);
			}
		}
	}
	for (const directory of ['vendors', 'plugins', 'rainloop/v/0.0.0/app/libraries'])
		bundled(path.join(project, directory));
	fs.writeFileSync(path.join(output, 'runtime-packages.json'), JSON.stringify(inventory, null, 2) + '\n');
};
