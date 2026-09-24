import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function createArtifact(directory, startedAt, initialReport) {
  await mkdir(directory, { recursive: true });
  const stem = startedAt.replace(/[:.]/g, '-');
  const initialJson = JSON.stringify(initialReport, null, 2);
  for (let suffix = 0; ; suffix++) {
    const path = join(directory, `${stem}${suffix ? `-${suffix}` : ''}.json`);
    try {
      // Claim the filename atomically, including when invocations start together.
      await writeFile(path, initialJson, { flag: 'wx' });
    } catch (err) {
      if (err.code === 'EEXIST') continue;
      throw err;
    }
    return {
      path,
      // Only this invocation owns this path. Checkpoint replacement is not
      // crash-atomic; callers must await each write before starting the next.
      persist: (report) => writeFile(path, JSON.stringify(report, null, 2)),
    };
  }
}
