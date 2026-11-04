/* RainLoop Webmail (c) RainLoop Team | Licensed under MIT */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { createRequire } from 'node:module';
import { finished } from 'node:stream/promises';
import webpack from 'webpack';
import less from 'less';
import postcss from 'postcss';
import autoprefixer from 'autoprefixer';
import { minify } from 'terser';
import { ZipArchive } from 'archiver';
import { ESLint } from 'eslint';
const require = createRequire(import.meta.url);
const { config } = require('../tasks/config.js');
const { collectLicenses } = require('../tasks/licenses.js');
const pkg = require('../package.json');
const base = 'rainloop/v/0.0.0';
const output = `${base}/static`;
const read = (file) => fs.readFile(file.trim(), 'utf8');
async function write(file, contents) {
 await fs.mkdir(path.dirname(file), { recursive: true });
 await fs.writeFile(file, contents);
}
async function copy(from, to) {
 await fs.mkdir(path.dirname(to), { recursive: true });
 await fs.cp(from, to, { recursive: true });
}
async function lint() {
 const eslint = new ESLint();
 const results = await eslint.lintFiles(['dev/**/*.js']);
 const formatter = await eslint.loadFormatter('stylish');
 const report = formatter.format(results);
 if (report) process.stdout.write(report);
 if (results.some((item) => item.errorCount)) throw new Error('JavaScript lint failed');
}
async function scripts() {
 const compiler = webpack(require('../webpack.config.builder.js')(`rainloop/v/${process.argv.includes('--release') ? pkg.version : '0.0.0'}/static/`, 'production'));
 await new Promise((resolve, reject) => compiler.run((error, stats) => {
  compiler.close((closeError) => {
   if (error || closeError) return reject(error || closeError);
   if (stats.hasErrors()) return reject(new Error(stats.toString({ all: false, errors: true })));
   resolve();
  });
 }));
 const libs = (await Promise.all(config.paths.js.libs.src.map(async (file) => {
  let source = await read(file);
  if (file === 'node_modules/keymaster/keymaster.js') {
   // Preserve the upstream RainLoop Insert-key alias without modifying node_modules.
   if (!source.includes('esc: 27,')) throw new Error('Keymaster compatibility patch needs review');
   source = '/*! Keymaster 1.6.2: Insert alias added by the maintained RainLoop fork. */\n' + source.replace('esc: 27,', 'insert: 45, esc: 27,');
  }
  return source;
 }))).join('\n;\n');
 await write(`${output}/js/libs.js`, libs);
 for (const entry of await fs.readdir(`${output}/js`)) {
  if (!entry.endsWith('.js')) continue;
  const result = await minify(await read(`${output}/js/${entry}`), { format: { comments: /^!|@license|@preserve|copyright|licensed|license|Permission is hereby|\(c\)/i } });
  await write(`${output}/js/min/${entry.replace(/\.js$/, '.min.js')}`, result.code);
 }
 await copy('node_modules/openpgp/dist/openpgp.min.js', `${output}/js/min/openpgp.min.js`);
 await copy('node_modules/jodit/es2021/jodit.min.js', `${output}/editor/jodit.min.js`);
}
async function styles() {
 for (const [name, entry] of Object.entries(config.paths.css)) {
  const parts = await Promise.all(entry.src.map(read));
  if (name === 'main') {
   const file = config.paths.less.main.src;
   parts.push((await less.render(await read(file), { filename: path.resolve(file), math: 'always', javascriptEnabled: false })).css);
  }
  const css = (await postcss([autoprefixer()]).process(parts.join('\n'), { from: undefined })).css
   .replace(/\.\.\/(img|images|fonts|svg)\//g, '$1/');
  await write(`${output}/css/${entry.name}`, css);
  // Keep a readable CSS artifact; HTTP compression provides transfer size reduction.
  await write(`${output}/css/${entry.name.replace(/\.css$/, '.min.css')}`, css);
 }
}
async function assets() {
 await copy('assets', output);
 await copy('vendors/fontastic/fonts', `${output}/css/fonts`);
 await copy('node_modules/jquery-ui/themes/base/images', `${output}/css/images`);
 const locale = `${base}/app/localization/moment`;
 await fs.rm(locale, { recursive: true, force: true });
 await copy('node_modules/moment/locale', locale);
}
async function release() {
 const root = `build/dist/releases/webmail/${pkg.version}`;
 const dist = `${root}/src`;
 await fs.rm(dist, { recursive: true, force: true });
 await copy(base, `${dist}/rainloop/v/${pkg.version}`);
 await write(`${dist}/data/VERSION`, pkg.version);
 await write(`${dist}/data/EMPTY`, pkg.version);
 const index = (await read('index.php')).replace("'APP_VERSION', '0.0.0'", `'APP_VERSION', '${pkg.version}'`);
 await write(`${dist}/index.php`, index);
 await write(`${dist}/rainloop/v/${pkg.version}/index.php.root`, index);
 for (const file of ['LICENSE', 'README.md', 'THIRD_PARTY_NOTICES.txt']) await copy(file, `${dist}/${file}`);
 await copy('tools/set-admin-password.php', `${dist}/tools/set-admin-password.php`);
 await copy('docs', `${dist}/docs`);
 await copy('build/openbsd', `${dist}/build/openbsd`);
 await copy('.docker/php', `${dist}/.docker/php`);
 await copy('.docker/nginx/default.conf', `${dist}/.docker/nginx/default.conf`);
 collectLicenses(dist);
 const target = `${root}/rainloop-webmail-fork-${pkg.version}.zip`;
 const stream = createWriteStream(target);
 const archive = new ZipArchive({ zlib: { level: 9 } });
 archive.on('error', (error) => stream.destroy(error));
 archive.pipe(stream);
 archive.directory(dist, false);
 await archive.finalize();
 await finished(stream);
 await fs.rm(dist, { recursive: true, force: true });
 console.log(`Release artifact: ${target}`);
}
await lint();
await fs.rm(output, { recursive: true, force: true });
await assets();
await Promise.all([scripts(), styles()]);
if (process.argv.includes('--release')) await release();
console.log('Frontend build complete');
