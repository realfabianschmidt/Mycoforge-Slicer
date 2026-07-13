import { createHash } from 'node:crypto';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const vendorRoot = path.join(repoRoot, 'vendor', 'orca');
const defaultVersion = 'v2.3.2';

const releases = {
  'v2.3.2': {
    version: 'v2.3.2',
    platform: 'windows-x64',
    assetName: 'OrcaSlicer_Windows_V2.3.2_portable.zip',
    assetUrl:
      'https://github.com/OrcaSlicer/OrcaSlicer/releases/download/v2.3.2/OrcaSlicer_Windows_V2.3.2_portable.zip',
    sha256: '9b83da960d57d8acc35b5a5f9c4d938345688f9d0368adfa20e707d9af618491',
    releaseUrl: 'https://github.com/OrcaSlicer/OrcaSlicer/releases/tag/v2.3.2',
    sourceUrl: 'https://github.com/OrcaSlicer/OrcaSlicer/tree/v2.3.2',
    sourceArchiveUrl: 'https://github.com/OrcaSlicer/OrcaSlicer/archive/refs/tags/v2.3.2.zip',
  },
};

function fail(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  let version = defaultVersion;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--version') {
      version = args[index + 1];
      index += 1;
    } else if (!arg.startsWith('--')) {
      version = arg;
    }
  }
  return { version };
}

function releaseFor(version) {
  const release = releases[version];
  if (!release) {
    fail(`Unsupported OrcaSlicer vendor version: ${version}. Supported: ${Object.keys(releases).join(', ')}`);
  }
  return release;
}

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

async function ensureArchive(release) {
  const downloadsDir = path.join(vendorRoot, 'downloads');
  mkdirSync(downloadsDir, { recursive: true });
  const archivePath = path.join(downloadsDir, release.assetName);

  if (existsSync(archivePath)) {
    const digest = sha256File(archivePath);
    if (digest === release.sha256) {
      return archivePath;
    }
    console.warn(`Existing Orca archive checksum mismatch (${digest}); downloading it again.`);
    rmSync(archivePath, { force: true });
  }

  console.log(`Downloading ${release.assetName}`);
  await downloadFile(release.assetUrl, archivePath);
  const digest = sha256File(archivePath);
  if (digest !== release.sha256) {
    rmSync(archivePath, { force: true });
    fail(`Checksum mismatch for ${release.assetName}. Expected ${release.sha256}, got ${digest}.`);
  }
  return archivePath;
}

function downloadFile(url, destination, redirects = 0) {
  if (redirects > 10) {
    return Promise.reject(new Error(`Too many redirects while downloading ${url}`));
  }

  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const request = client.get(
      url,
      {
        headers: {
          'User-Agent': 'mycoforge-release-vendor',
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
          response.resume();
          const nextUrl = new URL(response.headers.location, url).toString();
          downloadFile(nextUrl, destination, redirects + 1).then(resolve, reject);
          return;
        }

        if (status < 200 || status >= 300) {
          response.resume();
          reject(new Error(`Download failed with HTTP ${status}: ${url}`));
          return;
        }

        const output = createWriteStream(destination);
        response.pipe(output);
        output.on('finish', () => output.close(resolve));
        output.on('error', reject);
      },
    );
    request.on('error', reject);
  });
}

function validateZipSafe(archivePath) {
  const buffer = readFileSync(archivePath);
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;

  if (centralDirectoryEnd > buffer.length) {
    fail(`Invalid ZIP central directory in ${archivePath}.`);
  }

  let offset = centralDirectoryOffset;
  let entries = 0;
  while (offset < centralDirectoryEnd) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      fail(`Invalid ZIP central directory entry in ${archivePath}.`);
    }
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    const name = buffer.subarray(nameStart, nameEnd).toString('utf8');
    validateZipPath(name);
    offset = nameEnd + extraLength + commentLength;
    entries += 1;
  }

  if (entries === 0) {
    fail(`ZIP archive contains no entries: ${archivePath}`);
  }
}

function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 22 - 0xffff);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  fail('Could not find ZIP end of central directory.');
}

function validateZipPath(name) {
  if (!name || name.includes('\0')) {
    fail('Unsafe empty or NUL-containing path in OrcaSlicer archive.');
  }
  const normalized = name.replaceAll('\\', '/');
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    fail(`Unsafe absolute path in OrcaSlicer archive: ${name}`);
  }
  if (normalized.split('/').includes('..')) {
    fail(`Unsafe parent traversal in OrcaSlicer archive: ${name}`);
  }
}

function extractZip(archivePath, destination) {
  mkdirSync(destination, { recursive: true });

  const tar = spawnSync('tar', ['-xf', archivePath, '-C', destination], {
    stdio: 'inherit',
    shell: false,
  });
  if (tar.status === 0) {
    return;
  }

  const powershell = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-Command', 'Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force', archivePath, destination],
    {
      stdio: 'inherit',
      shell: false,
    },
  );
  if (powershell.status !== 0) {
    fail(`Could not extract ${archivePath}.`);
  }
}

function findOrcaBinary(root) {
  const executables = walk(root).filter((candidate) => candidate.toLowerCase().endsWith('.exe'));
  const preferred = ['orcaslicer.exe', 'orca-slicer.exe', 'orca_slicer.exe'];

  for (const name of preferred) {
    const match = executables.find((candidate) => path.basename(candidate).toLowerCase() === name);
    if (match) return match;
  }

  const fallback = executables.find((candidate) => {
    const lower = path.basename(candidate).toLowerCase();
    return lower.includes('orca') && lower.includes('slicer');
  });
  if (fallback) return fallback;

  fail(`No OrcaSlicer executable found under ${root}.`);
}

function walk(root) {
  const output = [];
  for (const entry of readdirSync(root)) {
    const fullPath = path.join(root, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      output.push(...walk(fullPath));
    } else if (stats.isFile()) {
      output.push(fullPath);
    }
  }
  return output;
}

function writeManifest(release, installDir, binaryPath) {
  const manifest = {
    schema_version: 1,
    package: 'OrcaSlicer',
    version: release.version,
    platform: release.platform,
    distribution: 'portable-zip',
    asset_name: release.assetName,
    asset_url: release.assetUrl,
    sha256: release.sha256,
    release_url: release.releaseUrl,
    license: 'AGPL-3.0-only',
    license_file: 'AGPL-3.0.txt',
    notice_file: 'THIRD_PARTY_NOTICES.md',
    source_url: release.sourceUrl,
    source_archive_url: release.sourceArchiveUrl,
    install_dir: toPosix(path.relative(vendorRoot, installDir)),
    binary_path: toPosix(path.relative(vendorRoot, binaryPath)),
  };
  writeFileSync(path.join(vendorRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function cleanDownloadCache() {
  rmSync(path.join(vendorRoot, 'downloads'), { recursive: true, force: true });
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

async function main() {
  const { version } = parseArgs();
  const release = releaseFor(version);
  const archivePath = await ensureArchive(release);
  validateZipSafe(archivePath);

  const installDir = path.join(vendorRoot, 'win-x64', version);
  rmSync(installDir, { recursive: true, force: true });
  extractZip(archivePath, installDir);

  const binaryPath = findOrcaBinary(installDir);
  writeManifest(release, installDir, binaryPath);
  cleanDownloadCache();
  console.log(`Prepared bundled OrcaSlicer ${version}: ${path.relative(repoRoot, binaryPath)}`);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
