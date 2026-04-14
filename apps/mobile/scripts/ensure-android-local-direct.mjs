import { readFileSync, writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const gradleFile = resolve(
  process.cwd(),
  'src-tauri/gen/android/app/build.gradle.kts',
);

if (!existsSync(gradleFile)) {
  process.exit(0);
}

const original = readFileSync(gradleFile, 'utf8');

let seenPlaceholder = false;
const next = original
  .split('\n')
  .flatMap((line) => {
    if (!line.includes('manifestPlaceholders["usesCleartextTraffic"]')) {
      return [line];
    }

    if (seenPlaceholder) {
      return [];
    }

    seenPlaceholder = true;
    return [line.replace(/"false"|"true"/, '"true"')];
  })
  .join('\n');

if (next !== original) {
  writeFileSync(gradleFile, next);
}
