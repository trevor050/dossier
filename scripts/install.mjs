import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const targetIndex = args.indexOf('--target');
const targetDir = targetIndex >= 0 ? args[targetIndex + 1] : process.cwd();
const writePackage = args.includes('--write-package');
const updateTsconfig = args.includes('--update-tsconfig');

if (!targetDir) {
  console.error('Missing --target <path>');
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');

const copyPairs = [
  { src: path.join(root, 'api'), dest: path.join(targetDir, 'api') },
  { src: path.join(root, 'server'), dest: path.join(targetDir, 'server') },
  { src: path.join(root, 'src', 'tracking'), dest: path.join(targetDir, 'src', 'tracking') },
];

for (const { src, dest } of copyPairs) {
  if (!fs.existsSync(src)) continue;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true });
}

if (writePackage) {
  const pkgPath = path.join(targetDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.dependencies = pkg.dependencies || {};
    pkg.devDependencies = pkg.devDependencies || {};
    if (!pkg.dependencies.pg) pkg.dependencies.pg = '^8.17.1';
    if (!pkg.dependencies['@fingerprintjs/fingerprintjs']) {
      pkg.dependencies['@fingerprintjs/fingerprintjs'] = '^5.0.1';
    }
    if (!pkg.devDependencies['@types/pg']) pkg.devDependencies['@types/pg'] = '^8.16.0';
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  }
}

if (updateTsconfig) {
  const tsconfigPath = path.join(targetDir, 'tsconfig.json');
  if (fs.existsSync(tsconfigPath)) {
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
    if (Array.isArray(tsconfig.include)) {
      if (!tsconfig.include.includes('api')) tsconfig.include.push('api');
      if (!tsconfig.include.includes('server')) tsconfig.include.push('server');
    }
    fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + '\n');
  }
}

console.log('Dossier files copied.');
console.log('Next steps:');
console.log('- Add env vars (DATABASE_URL, ADMIN_TOKEN)');
console.log('- Install deps (pg, @fingerprintjs/fingerprintjs, @types/pg)');
console.log('- Point VITE_TRACKER_ENDPOINT to /api/collect');
