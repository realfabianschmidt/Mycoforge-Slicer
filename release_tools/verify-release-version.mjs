import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const versions = readVersions();
const uniqueVersions = new Set(Object.values(versions));
if (uniqueVersions.size !== 1) {
  console.error('Release version mismatch across project files:');
  for (const [file, version] of Object.entries(versions)) {
    console.error(`- ${file}: ${version || '<missing>'}`);
  }
  process.exit(1);
}

const version = versions['apps/desktop/src-tauri/tauri.conf.json'];
const expectedTag = `app-v${version}`;
const actualTag = process.argv[2] || process.env.GITHUB_REF_NAME || '';

if (actualTag !== expectedTag) {
  console.error(`Release tag mismatch: expected ${expectedTag}, got ${actualTag || '<empty>'}.`);
  process.exit(1);
}

console.log(`Release version verified: ${version}`);

function readVersions() {
  return {
    'package.json': readJsonVersion('package.json'),
    'apps/desktop/package.json': readJsonVersion('apps/desktop/package.json'),
    'apps/desktop/package-lock.json': readJsonVersion('apps/desktop/package-lock.json'),
    'pyproject.toml': readTomlVersion('pyproject.toml'),
    'apps/desktop/src-tauri/tauri.conf.json': readJsonVersion('apps/desktop/src-tauri/tauri.conf.json'),
    'apps/desktop/src-tauri/Cargo.toml': readTomlVersion('apps/desktop/src-tauri/Cargo.toml'),
    'apps/desktop/src-tauri/Cargo.lock': readCargoLockVersion('apps/desktop/src-tauri/Cargo.lock'),
  };
}

function readJsonVersion(relativePath) {
  return JSON.parse(readText(relativePath)).version;
}

function readTomlVersion(relativePath) {
  return readText(relativePath).match(/^version\s*=\s*"(?<version>[^"]+)"/m)?.groups?.version;
}

function readCargoLockVersion(relativePath) {
  return readText(relativePath).match(/\[\[package\]\]\r?\nname = "mycoforge-studio"\r?\nversion = "(?<version>[^"]+)"/)?.groups?.version;
}

function readText(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}
