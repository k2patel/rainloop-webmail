const { spawnSync } = require('child_process');

const result = spawnSync('yarn', ['audit', '--json'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const seen = new Set();
let summary = null;
for (const line of (result.stdout || '').split('\n')) {
	let event;
	try { event = JSON.parse(line); } catch (_) { continue; }
	if (event.type === 'auditSummary') summary = event.data.vulnerabilities;
	if (event.type === 'error') process.stderr.write(event.data + '\n');
	if (event.type === 'auditAdvisory') {
		const advisory = event.data.advisory;
		if (!seen.has(advisory.id)) {
			seen.add(advisory.id);
			process.stdout.write(JSON.stringify({ package: advisory.module_name, severity: advisory.severity,
				title: advisory.title, patched: advisory.patched_versions, url: advisory.url }) + '\n');
		}
	}
}
if (!summary) {
	process.stderr.write(result.stderr || 'No dependency audit summary was returned.\n');
	process.exit(1);
}
process.stdout.write(JSON.stringify({ summary }) + '\n');

if (Object.values(summary).some(count => count > 0)) process.exitCode = 1;
