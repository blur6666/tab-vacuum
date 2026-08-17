import { readFileSync, mkdirSync, cpSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const version = manifest.version;
const outZip = `tab-vacuum-${version}.zip`;
const stageDir = join(ROOT, 'tmp', 'package');

// Clean and create staging directory
if (existsSync(stageDir)) {
  rmSync(stageDir, { recursive: true, force: true });
}
mkdirSync(join(stageDir, 'assets', 'icons'), { recursive: true });

// Copy manifest
cpSync(join(ROOT, 'manifest.json'), join(stageDir, 'manifest.json'));

// Copy icons
const iconSizes = ['16', '32', '48', '128'];
for (const size of iconSizes) {
  const iconName = `icon${size}.png`;
  cpSync(join(ROOT, 'assets', 'icons', iconName), join(stageDir, 'assets', 'icons', iconName));
}

// Copy src
cpSync(join(ROOT, 'src'), join(stageDir, 'src'), { recursive: true });

// Remove existing zip
const outZipPath = join(ROOT, outZip);
if (existsSync(outZipPath)) {
  rmSync(outZipPath, { force: true });
}

// Compress archive
if (process.platform === 'win32') {
  execSync(
    `powershell.exe -NoProfile -NonInteractive -Command "Compress-Archive -Path '${stageDir}/*' -DestinationPath '${outZipPath}' -Force"`,
    { stdio: 'inherit' }
  );
} else {
  execSync(`cd "${stageDir}" && zip -r "${outZipPath}" ./*`, { stdio: 'inherit' });
}

// Clean staging directory
rmSync(join(ROOT, 'tmp'), { recursive: true, force: true });

console.log(`\nSuccessfully packaged ${outZip}`);
