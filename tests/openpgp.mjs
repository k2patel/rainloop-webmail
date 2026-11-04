import * as api from 'openpgp';
import { readFile } from 'node:fs/promises';
import { runOpenPgpChecks } from './openpgp-cases.mjs';

// Load the same dependency-free helpers that the application bundles.
const source = await readFile(new URL('../dev/Common/OpenPgp.js', import.meta.url), 'utf8');
const helpers = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const checks = await runOpenPgpChecks(api, helpers);
console.log(`${checks} OpenPGP migration and security checks passed`);
