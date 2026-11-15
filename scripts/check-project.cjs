'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const requiredFiles = [
  'index.html', 'display.html', 'manifest.webmanifest', 'main.js', 'preload.js',
  'src/app.js', 'src/styles.css', 'assets/churchflow.ico', 'assets/churchflow.png',
  'native/ndi/binding.gyp', 'native/ndi/ndi_sender.cpp', 'native/ndi/include/README.md',
  'native/ndi/include/Processing.NDI.Lib.h', 'native/ndi/include/Processing.NDI.compat.h',
  'native/ndi/include/Processing.NDI.structs.h', 'native/ndi/include/Processing.NDI.Find.h',
  'native/ndi/include/Processing.NDI.Recv.h', 'native/ndi/include/Processing.NDI.Recv.ex.h',
  'native/ndi/include/Processing.NDI.RecvAdvertiser.h', 'native/ndi/include/Processing.NDI.RecvListener.h',
  'native/ndi/include/Processing.NDI.Send.h', 'native/ndi/include/Processing.NDI.SendAdvertiser.h',
  'native/ndi/include/Processing.NDI.SendListener.h', 'native/ndi/include/Processing.NDI.Routing.h',
  'native/ndi/include/Processing.NDI.utilities.h', 'native/ndi/include/Processing.NDI.deprecated.h',
  'native/ndi/include/Processing.NDI.FrameSync.h', 'native/ndi/include/Processing.NDI.DynamicLoad.h',
  'native/ndi/include/Processing.NDI.Lib.cplusplus.h',
  '.github/workflows/windows-installer.yml'
];
const problems = [];
const ndiAddonPath = path.join(root, 'native/ndi/build/Release/churchflow_ndi.node');
if (process.env.CI === 'true' && !fs.existsSync(ndiAddonPath)) {
  problems.push('The Electron-compatible NDI native addon was not built before packaging.');
}
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
  if (!/^0\.9\.\d+$/.test(pkg.version)) problems.push(`Expected a 0.9.x release version, found ${pkg.version}`);
  if (!pkg.scripts?.['dist:win']) problems.push('Missing dist:win build script.');
  if (pkg.devDependencies?.electron !== '45.2.3') problems.push('Electron must remain pinned to the v0.7 tested release.');
  if (pkg.engines?.node !== '>=24.0.0 <27') problems.push('Node.js engine range must allow supported major versions 24 through 26.');
  if (!pkg.build?.files?.includes('manifest.webmanifest')) problems.push('manifest.webmanifest is not included in the packaged application.');
  const ndiUnpack = pkg.build?.asarUnpack || [];
  for (const pattern of ['native/ndi/build/Release/**/*.node']) {
    if (!ndiUnpack.includes(pattern)) problems.push(`NDI release packaging is missing asarUnpack pattern: ${pattern}`);
  }
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
  if (!fs.existsSync(ndiAddonPath)) console.warn('NDI native addon has not been built locally. The Windows release workflow builds it before packaging. The official NDI Runtime 6 must be installed separately on each target computer.');
}
