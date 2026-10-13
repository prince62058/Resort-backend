import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
for (const folder of ['server', 'shared', 'scripts']) {
  for (const file of await readdir(folder, {recursive:true})) {
    if (!file.endsWith('.js')) continue;
    const result = spawnSync(process.execPath, ['--check', folder + '/' + file], {stdio:'inherit'});
    if (result.status !== 0) process.exit(1);
  }
}
console.log('Backend source checked. No frontend build or database access is required to build.');
