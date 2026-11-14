'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const requiredFiles = [
  'index.html', 'display.html', 'manifest.webmanifest', 'main.js', 'preload.js',
  'src/app.js', 'src/styles.css', 'assets/churchflow.ico',
  'native/ndi/binding.gyp', 'native/ndi/ndi_sender.cpp',
  '.github/workflows/windows-installer.yml'
];
const problems = [];
for (const relative of requiredFiles) {
  if (!fs.existsSync(path.join(root, relative))) problems.push(`Missing required file: ${relative}`);
}

for (const relative of ['main.js', 'preload.js', 'src/app.js']) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) continue;
  try { new vm.Script(fs.readFileSync(file, 'utf8'), { filename: relative }); }
  catch (error) { problems.push(`${relative} syntax error: ${error.message}`); }
}

const html = fs.existsSync(path.join(root, 'index.html')) ? fs.readFileSync(path.join(root, 'index.html'), 'utf8') : '';
const appJs = fs.existsSync(path.join(root, 'src/app.js')) ? fs.readFileSync(path.join(root, 'src/app.js'), 'utf8') : '';
const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
const appSelectors = [...appJs.matchAll(/\$\(['"]#([A-Za-z][A-Za-z0-9_-]*)['"]\)/g)].map((match) => match[1]);
for (const id of new Set(appSelectors)) {
  if (!htmlIds.has(id)) problems.push(`Renderer references missing HTML id: #${id}`);
}

try {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (pkg.version !== '0.8.1') problems.push(`Expected package version 0.8.1, found ${pkg.version}`);
  if (!pkg.scripts?.['dist:win']) problems.push('Missing dist:win build script.');
  if (pkg.devDependencies?.electron !== '45.2.3') problems.push('Electron must remain pinned to the v0.7 tested release.');
  if (pkg.engines?.node !== '>=24.0.0 <27') problems.push('Node.js engine range must allow supported major versions 24 through 26.');
  if (!pkg.build?.files?.includes('manifest.webmanifest')) problems.push('manifest.webmanifest is not included in the packaged application.');
  if (!pkg.build?.win?.target?.includes('nsis') || !pkg.build?.win?.target?.includes('portable')) problems.push('Windows NSIS and portable targets must both be configured.');
  try { JSON.parse(fs.readFileSync(path.join(root, 'native/ndi/binding.gyp'), 'utf8')); } catch (error) { problems.push(`NDI binding.gyp is not valid JSON: ${error.message}`); }
} catch (error) { problems.push(`package.json could not be read: ${error.message}`); }

if (problems.length) {
  console.error('ChurchFlow project check FAILED:');
  for (const problem of problems) console.error(` - ${problem}`);
  process.exitCode = 1;
} else {
  console.log('ChurchFlow project check passed.');
  console.log(`Checked ${requiredFiles.length} required files, 3 JavaScript files and ${new Set(appSelectors).size} renderer selectors.`);
}
