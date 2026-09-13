import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import * as tar from 'tar';
import { type Manifest } from 'twenty-shared/application';

// npm pack always excludes yarn.lock, even when the manifest declares it.
// Snapshot regular build output and archive those exact bytes without npm's
// publish filters or lifecycle scripts. Temporary files never enter the archive.
export const packApplication = async (outputDir: string): Promise<string> => {
  const files = new Map<string, Buffer>();
  const collect = async (directory: string, relativeDirectory = '') => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      const absolutePath = join(directory, entry.name);
      const info = await lstat(absolutePath);
      if (info.isSymbolicLink())
        throw new Error(`Cannot archive symbolic link: ${relativePath}`);
      if (info.isDirectory()) {
        if (!relativeDirectory && entry.name.startsWith('.twenty-archive-'))
          continue;
        await collect(absolutePath, relativePath);
      } else if (info.isFile()) {
        const file = await open(
          absolutePath,
          constants.O_RDONLY | constants.O_NOFOLLOW,
        );
        try {
          files.set(relativePath, await file.readFile());
        } finally {
          await file.close();
        }
      } else
        throw new Error(`Cannot archive non-regular file: ${relativePath}`);
    }
  };
  await collect(outputDir);
  const manifestBytes = files.get('manifest.json');
  if (!manifestBytes) throw new Error('Missing manifest.json in build output');
  const manifest: Manifest = JSON.parse(manifestBytes.toString('utf8'));
  const verify = (name: string, checksum: string | null | undefined) => {
    const bytes = files.get(name);
    if (!bytes) throw new Error(`Missing ${name} in build output`);
    if (
      checksum != null &&
      createHash('md5').update(bytes).digest('hex') !== checksum
    ) {
      throw new Error(`Checksum mismatch for ${name}`);
    }
  };
  verify('package.json', manifest.application.packageJsonChecksum);
  if (manifest.application.yarnLockChecksum != null)
    verify('yarn.lock', manifest.application.yarnLockChecksum);
  else files.delete('yarn.lock');

  const publicAssets = new Set(
    (manifest.publicAssets ?? []).map((asset) => asset.filePath),
  );
  for (const name of files.keys()) {
    if (
      !name.includes('/') &&
      /\.(tgz|tar(?:\.gz)?)$/.test(name) &&
      !publicAssets.has(name)
    )
      files.delete(name);
  }
  const temporaryDir = await mkdtemp(join(outputDir, '.twenty-archive-'));
  try {
    const contentDir = join(temporaryDir, 'content');
    await mkdir(contentDir);
    for (const [name, bytes] of files) {
      await mkdir(dirname(join(contentDir, name)), { recursive: true });
      await writeFile(join(contentDir, name), bytes);
    }
    const archivePath = join(temporaryDir, 'application.tgz');
    await tar.create(
      {
        cwd: contentDir,
        file: archivePath,
        gzip: true,
        portable: true,
        prefix: 'package',
        strict: true,
      },
      // Prefix literal paths so tar cannot interpret @asset as an include.
      [...files.keys()].sort().map((name) => `./${name}`),
    );
    let archiveName = 'application.tgz';
    let suffix = 0;
    while (publicAssets.has(archiveName)) {
      archiveName = `application-${++suffix}.tgz`;
    }
    const destination = join(outputDir, archiveName);
    await rename(archivePath, destination);
    return destination;
  } finally {
    await rm(temporaryDir, { recursive: true, force: true });
  }
};
