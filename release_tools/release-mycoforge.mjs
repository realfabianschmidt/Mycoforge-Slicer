import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const gitSafeDirectory = repoRoot.replaceAll('\\', '/');
const command = process.argv[2];
const versionInput = process.argv[3];
const flags = new Set(process.argv.slice(4));
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function printHelp() {
  console.log(`
Mycoforge release helper

Usage:
  node release_tools/release-mycoforge.mjs release <patch|minor|major|version> [--dry-run] [--full-checks] [--skip-checks]
  node release_tools/release-mycoforge.mjs prepare <patch|minor|major|version> [--full-checks] [--skip-checks]
  node release_tools/release-mycoforge.mjs publish <version>
  node release_tools/release-mycoforge.mjs status

Recommended Windows command:
  .\\release.ps1 patch

The release command bumps all app version files, runs checks, commits on main,
pushes main, then pushes app-v<version> to start the GitHub release workflow.
`);
}

function fail(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

function run(cmd, args, options = {}) {
  const capture = Boolean(options.capture);
  const result = spawnSync(cmd, args, {
    cwd: options.cwd || repoRoot,
    stdio: capture ? 'pipe' : 'inherit',
    encoding: capture ? 'utf8' : undefined,
    shell: options.shell ?? shouldUseShell(cmd),
    maxBuffer: 100 * 1024 * 1024,
  });

  if (result.error) {
    if (options.allowFailure) {
      return result;
    }
    fail(`Could not start '${cmd}'. ${result.error.message}`);
  }

  if (result.status !== 0) {
    if (capture && result.stderr) {
      process.stderr.write(result.stderr);
    }
    if (options.allowFailure) {
      return result;
    }
    fail(`Command failed: ${cmd} ${args.join(' ')}`);
  }

  if (capture && options.allowFailure) {
    return result;
  }
  return capture ? result.stdout.trim() : result;
}

function shouldUseShell(cmd) {
  return process.platform === 'win32' && /\.(cmd|bat)$/i.test(cmd);
}

function git(args, options = {}) {
  return run('git', ['-c', `safe.directory=${gitSafeDirectory}`, ...args], options);
}

function readText(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function writeText(relativePath, value) {
  writeFileSync(path.join(repoRoot, relativePath), value, 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function writeJson(relativePath, value) {
  writeText(relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function currentVersion() {
  return readJson('apps/desktop/src-tauri/tauri.conf.json').version;
}

function ensureSemver(value) {
  if (!/^\d+\.\d+\.\d+$/.test(value || '')) {
    fail(`Expected a SemVer version like 0.2.0, got: ${value || '<empty>'}`);
  }
}

function resolveNextVersion(input) {
  const current = currentVersion();
  const [major, minor, patch] = current.split('.').map((part) => Number.parseInt(part, 10));
  if (input === 'patch') return `${major}.${minor}.${patch + 1}`;
  if (input === 'minor') return `${major}.${minor + 1}.0`;
  if (input === 'major') return `${major + 1}.0.0`;
  ensureSemver(input);
  return input;
}

function releaseTagName(version) {
  return `app-v${version}`;
}

function currentBranch() {
  return git(['branch', '--show-current'], { capture: true });
}

function headSha(ref = 'HEAD') {
  return git(['rev-parse', ref], { capture: true });
}

function ensureTagDoesNotExist(tagName) {
  const local = git(['rev-parse', '--verify', tagName], {
    capture: true,
    allowFailure: true,
  });
  if (local.status === 0) {
    fail(`Local tag already exists: ${tagName}`);
  }

  if (git(['ls-remote', '--tags', 'origin', tagName], { capture: true })) {
    fail(`Remote tag already exists: ${tagName}`);
  }
}

function ensureCleanWorkingTree() {
  const status = git(['status', '--porcelain'], { capture: true });
  if (status) {
    fail(`Working tree must be clean before releasing:\n${status}`);
  }
}

function ensureDirectReleaseStartingPoint() {
  git(['fetch', 'origin', 'main', '--tags']);
  const branch = currentBranch();

  if (branch !== 'main') {
    fail(`You are on '${branch}'. Switch to main before starting a release.`);
  }

  ensureCleanWorkingTree();

  if (headSha('HEAD') !== headSha('origin/main')) {
    fail('Local main is not equal to origin/main. Pull or push main before releasing.');
  }
}

function replaceRegex(relativePath, regex, replacement) {
  const input = readText(relativePath);
  const output = input.replace(regex, replacement);
  if (output === input) {
    fail(`Could not update ${relativePath}.`);
  }
  writeText(relativePath, output);
}

function bumpPackageJson(relativePath, nextVersion) {
  const json = readJson(relativePath);
  json.version = nextVersion;
  if (json.packages?.['']) {
    json.packages[''].version = nextVersion;
  }
  writeJson(relativePath, json);
}

function bumpVersions(nextVersion) {
  bumpPackageJson('package.json', nextVersion);
  bumpPackageJson('apps/desktop/package.json', nextVersion);
  bumpPackageJson('apps/desktop/package-lock.json', nextVersion);
  bumpPackageJson('apps/desktop/src-tauri/tauri.conf.json', nextVersion);
  replaceRegex('pyproject.toml', /^version\s*=\s*"[^"]+"/m, `version = "${nextVersion}"`);
  replaceRegex('apps/desktop/src-tauri/Cargo.toml', /^version\s*=\s*"[^"]+"/m, `version = "${nextVersion}"`);
  replaceRegex(
    'apps/desktop/src-tauri/Cargo.lock',
    /(\[\[package\]\]\r?\nname = "mycoforge-studio"\r?\nversion = ")[^"]+(")/,
    `$1${nextVersion}$2`,
  );
}

function ensureToolchain() {
  const tools = [
    { cmd: 'node', args: ['--version'], hint: 'Install Node.js from https://nodejs.org' },
    { cmd: npmCommand, args: ['--version'], hint: 'Install npm with Node.js' },
    { cmd: 'python', args: ['--version'], hint: 'Install Python 3.11 or newer from https://python.org' },
    { cmd: 'cargo', args: ['--version'], hint: 'Install Rust from https://rustup.rs' },
    { cmd: 'git', args: ['--version'], hint: 'Install Git from https://git-scm.com' },
  ];

  const missing = [];
  for (const tool of tools) {
    const result = run(tool.cmd, tool.args, { capture: true, allowFailure: true });
    if (result.error || result.status !== 0) {
      missing.push(`- ${tool.cmd}: ${tool.hint}`);
    }
  }
  if (missing.length > 0) {
    fail(`Some tools needed for release checks are missing:\n${missing.join('\n')}\n\nInstall them, or run with --skip-checks to skip local checks.`);
  }
}

function runChecks(nextVersion) {
  ensureToolchain();
  run('node', ['--check', 'release_tools/verify-release-version.mjs']);
  run('node', ['--check', 'release_tools/release-mycoforge.mjs']);
  run('node', ['--check', 'release_tools/prepare-orca-vendor.mjs']);
  run('node', ['release_tools/verify-release-version.mjs', releaseTagName(nextVersion)]);
  run(npmCommand, ['--prefix', 'apps/desktop', 'run', 'test']);
  run(npmCommand, ['--prefix', 'apps/desktop', 'run', 'build']);
  run('python', ['-m', 'pytest']);

  if (flags.has('--full-checks')) {
    run('node', ['release_tools/prepare-orca-vendor.mjs', '--version', 'v2.3.2']);
    run(npmCommand, ['--prefix', 'apps/desktop', 'run', 'tauri:build']);
  }

  git(['diff', '--check']);
}

function stagedFiles() {
  const output = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR'], { capture: true });
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

function ensureNoStagedSecrets(files) {
  const blockedExtensions = /\.(cer|crt|env|pfx|p12|pem|p8|key)$/i;
  const blockedPath = /(^|\/|\\)(\.secrets|local_secrets\.json|saved_results|ssl)($|\/|\\)/i;
  const privateKeyNeedle = ['BEGIN ', 'PRIVATE KEY'].join('');
  const secretAssignment = /\b(GITHUB_TOKEN|GH_TOKEN|PRIVATE_KEY|SECRET|TOKEN)\s*=/;

  for (const file of files) {
    if (blockedExtensions.test(file) || blockedPath.test(file)) {
      fail(`Refusing to commit possible secret file: ${file}`);
    }

    const content = git(['show', `:${file}`], {
      capture: true,
      allowFailure: true,
    });
    if (content.status !== 0) {
      continue;
    }

    if (content.stdout.includes(privateKeyNeedle) || secretAssignment.test(content.stdout)) {
      fail(`Refusing to commit possible secret content in: ${file}`);
    }
  }
}

function commitVersionChanges(version, message) {
  git(['add', '-A']);
  const files = stagedFiles();
  if (files.length === 0) {
    fail('No changes are staged. Make changes first, or choose a new version.');
  }

  ensureNoStagedSecrets(files);
  git(['commit', '-m', message || `Release Mycoforge Studio ${version}`]);
}

function readVersionFromGit(ref, relativePath, reader) {
  const content = git(['show', `${ref}:${relativePath}`], { capture: true });
  return reader(content);
}

function verifyRemoteMainVersion(version) {
  const tauriVersion = readVersionFromGit('origin/main', 'apps/desktop/src-tauri/tauri.conf.json', (content) => {
    return JSON.parse(content).version;
  });
  if (tauriVersion !== version) {
    console.error('origin/main does not contain the requested release version yet:');
    console.error(`- apps/desktop/src-tauri/tauri.conf.json: ${tauriVersion || '<missing>'}`);
    fail('Push the release version commit to main first, then run publish again.');
  }
}

function pushReleaseTag(version) {
  const tagName = releaseTagName(version);
  git(['fetch', 'origin', 'main', '--tags']);
  ensureTagDoesNotExist(tagName);
  verifyRemoteMainVersion(version);
  git(['tag', '-a', tagName, 'origin/main', '-m', `Mycoforge Studio ${version}`]);
  git(['push', 'origin', tagName]);
  return tagName;
}

function printReleaseLinks(tagName) {
  console.log('\nGitHub Actions:');
  console.log('https://github.com/realfabianschmidt/Mycoforge-Slicer/actions/workflows/release.yml');
  console.log('\nRelease page:');
  console.log(`https://github.com/realfabianschmidt/Mycoforge-Slicer/releases/tag/${tagName}`);
}

function prepare(version) {
  const resolvedVersion = resolveNextVersion(version || 'patch');
  const tagName = releaseTagName(resolvedVersion);

  ensureTagDoesNotExist(tagName);
  ensureDirectReleaseStartingPoint();
  bumpVersions(resolvedVersion);

  if (!flags.has('--skip-checks')) {
    runChecks(resolvedVersion);
  } else {
    console.warn('Skipping checks because --skip-checks was provided.');
  }

  commitVersionChanges(resolvedVersion, `Prepare Mycoforge Studio ${resolvedVersion}`);
  console.log(`\nPrepared local version commit for ${resolvedVersion}. No tag was created.`);
}

function publish(version) {
  ensureSemver(version);
  const tagName = pushReleaseTag(version);
  console.log(`\nRelease tag pushed: ${tagName}`);
  printReleaseLinks(tagName);
}

async function release(input) {
  const resolvedVersion = resolveNextVersion(input || 'patch');
  const tagName = releaseTagName(resolvedVersion);

  console.log(`Mycoforge Studio release target: ${resolvedVersion}`);
  console.log('Branch: main');
  console.log(`Tag: ${tagName}`);

  if (flags.has('--dry-run')) {
    console.log('\nDry run only. No files, commits, pushes, tags, or releases were changed.');
    console.log('\nA real release would bump versions, run local checks, commit on main, push main, and push the release tag.');
    return;
  }

  ensureTagDoesNotExist(tagName);
  ensureDirectReleaseStartingPoint();
  bumpVersions(resolvedVersion);

  if (!flags.has('--skip-checks')) {
    runChecks(resolvedVersion);
  } else {
    console.warn('Skipping checks because --skip-checks was provided.');
  }

  commitVersionChanges(resolvedVersion, `Release Mycoforge Studio ${resolvedVersion}`);
  git(['push', 'origin', 'main']);
  const pushedTag = pushReleaseTag(resolvedVersion);
  console.log(`\nRelease tag pushed: ${pushedTag}`);
  printReleaseLinks(pushedTag);
}

function status() {
  console.log(`Branch: ${currentBranch() || '<detached>'}`);
  console.log(`Git status:\n${git(['status', '--short'], { capture: true }) || '<clean>'}`);
  console.log(`App version: ${currentVersion()}`);
}

if (!command || command === '--help' || command === '-h') {
  printHelp();
  process.exit(0);
}

try {
  if (command === 'release') {
    await release(versionInput);
  } else if (command === 'prepare') {
    prepare(versionInput);
  } else if (command === 'publish') {
    publish(versionInput);
  } else if (command === 'status') {
    status();
  } else if (['patch', 'minor', 'major'].includes(command) || /^\d+\.\d+\.\d+$/.test(command)) {
    await release(command);
  } else {
    printHelp();
    fail(`Unknown command: ${command}`);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
