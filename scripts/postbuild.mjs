// Post-build checks: CLI is executable, version constant matches package.json.
import { chmodSync, readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8');
if (!version.includes(`'${pkg.version}'`)) {
  console.error(`src/version.ts does not match package.json version ${pkg.version}`);
  process.exit(1);
}
chmodSync(new URL('../dist/cli/index.js', import.meta.url), 0o755);
