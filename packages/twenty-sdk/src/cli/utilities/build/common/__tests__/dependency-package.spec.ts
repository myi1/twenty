import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type Manifest, OUTPUT_DIR } from 'twenty-shared/application';
import { FileFolder } from 'twenty-shared/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApplication } from '@/cli/utilities/build/common/build-application';
import { type EntityFilePaths } from '@/cli/utilities/build/manifest/manifest-extract-config';
import { manifestUpdateChecksums } from '@/cli/utilities/build/manifest/manifest-update-checksums';

// An empty source set exercises the real dependency copy/checksum path without
// compiling application code or invoking any publisher or dependency installer.
describe('dependency build output', () => {
  let appPath: string;
  const lockBytes = Buffer.from(
    '# yarn lock\r\n__metadata:\r\n  version: 8\r\n',
  );
  const manifest = {
    application: { yarnLockChecksum: null, packageJsonChecksum: null },
    logicFunctions: [],
    frontComponents: [],
    publicAssets: [],
  } as unknown as Manifest;
  const filePaths = {
    logicFunctions: [],
    frontComponents: [],
    publicAssets: [],
  } as unknown as EntityFilePaths;

  beforeEach(async () => {
    appPath = await mkdtemp(join(tmpdir(), 'sdk-dependency-package-'));
    await writeFile(join(appPath, 'package.json'), '{"name":"fixture"}');
  });

  afterEach(async () => {
    await rm(appPath, { recursive: true, force: true });
  });

  it('preserves lock bytes and their raw MD5 in the output manifest', async () => {
    await writeFile(join(appPath, 'yarn.lock'), lockBytes);
    const { builtFileInfos } = await buildApplication({
      appPath,
      manifest,
      filePaths,
    });
    expect(await readFile(join(appPath, OUTPUT_DIR, 'yarn.lock'))).toEqual(
      lockBytes,
    );
    expect(builtFileInfos.get(join(OUTPUT_DIR, 'yarn.lock'))?.fileFolder).toBe(
      FileFolder.Dependencies,
    );
    const result = manifestUpdateChecksums({ manifest, builtFileInfos });
    expect(result.application.yarnLockChecksum).toBe(
      '17b081a581e8a346d32e8631f41f2d28',
    );
    expect(manifest.application.yarnLockChecksum).toBeNull();
  });

  it('leaves legacy no-lock packages buildable without inventing a checksum', async () => {
    const { builtFileInfos } = await buildApplication({
      appPath,
      manifest,
      filePaths,
    });
    expect(builtFileInfos.has(join(OUTPUT_DIR, 'yarn.lock'))).toBe(false);
    expect(
      manifestUpdateChecksums({ manifest, builtFileInfos }).application
        .yarnLockChecksum,
    ).toBeNull();
    await expect(
      readFile(join(appPath, OUTPUT_DIR, 'yarn.lock')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
