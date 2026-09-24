import { readFile } from 'node:fs/promises';
import { extractRecords } from './result-records.mjs';

const usage = 'Usage: npm run analyze -- <result.json> [more-results.json ...]';

async function main() {
  const paths = process.argv.slice(2);
  if (paths.length === 1 && paths[0] === '--help') {
    console.log(usage);
    return;
  }
  if (paths.length === 0) throw new Error(usage);

  // Caller-supplied file order and recorded attempt order are experiment order.
  // Validate every input before emitting anything, so a later bad file cannot
  // leave stdout looking like a successful, shorter analysis.
  const records = [];
  for (const path of paths) {
    let artifact;
    try {
      artifact = JSON.parse(await readFile(path, 'utf8'));
    } catch (err) {
      throw new Error(`${path}: ${err.message}`, { cause: err });
    }
    for (const record of extractRecords(artifact, path)) records.push(record);
  }
  console.log(JSON.stringify(records, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 2;
});
