import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type Manifest } from 'twenty-shared/application';
import { FileFolder } from 'twenty-shared/types';

import { ApplicationInstallService } from './application-install.service';

// Exercise real package reads and the installer file selection. Only the storage
// boundary is replaced so these tests cannot contact a database or object store.
describe('application dependency package installation', () => {
  let extractedDir: string;
  let service: ApplicationInstallService;
  let storedFiles: Map<string, Buffer>;
  const lockBytes = Buffer.from(
    '# yarn lock\r\n__metadata:\r\n  version: 8\r\n',
  );

  beforeEach(async () => {
    extractedDir = await mkdtemp(join(tmpdir(), 'installer-lock-'));
    await writeFile(join(extractedDir, 'package.json'), '{"name":"fixture"}');
    await writeFile(join(extractedDir, 'manifest.json'), '{}');
    storedFiles = new Map();
    service = Object.create(ApplicationInstallService.prototype);
    Object.assign(service, {
      fileStorageService: {
        writeFile: async (params: {
          sourceFile: Buffer;
          fileFolder: FileFolder;
          resourcePath: string;
          workspaceId: string;
          applicationUniversalIdentifier: string;
        }) => {
          expect(params.workspaceId).toBe('workspace-fixture');
          expect(params.applicationUniversalIdentifier).toBe(
            'application-fixture',
          );
          storedFiles.set(
            `${params.fileFolder}/${params.resourcePath}`,
            params.sourceFile,
          );
        },
      },
    });
  });

  afterEach(async () => {
    await rm(extractedDir, { recursive: true, force: true });
  });

  const installFiles = (yarnLockChecksum: string | null | undefined) =>
    service['writeFilesToStorage'](
      extractedDir,
      {
        application: { yarnLockChecksum },
        logicFunctions: [],
        frontComponents: [],
        publicAssets: [],
      } as unknown as Manifest,
      'application-fixture',
      'workspace-fixture',
    );

  it('stores a declared lock unchanged in the dependency folder', async () => {
    await writeFile(join(extractedDir, 'yarn.lock'), lockBytes);
    await installFiles('declared-lock-checksum');
    expect(storedFiles.get(`${FileFolder.Dependencies}/yarn.lock`)).toEqual(
      lockBytes,
    );
    expect(storedFiles.get(`${FileFolder.Dependencies}/package.json`)).toEqual(
      await readFile(join(extractedDir, 'package.json')),
    );
    expect(storedFiles.has(`${FileFolder.Source}/manifest.json`)).toBe(true);
  });

  it.each([null, undefined])(
    'installs legacy packages with no lock checksum (%s)',
    async (checksum) => {
      await expect(installFiles(checksum)).resolves.toBeUndefined();
      expect([...storedFiles.keys()]).toEqual([
        `${FileFolder.Dependencies}/package.json`,
        `${FileFolder.Source}/manifest.json`,
      ]);
    },
  );

  it('fails package resolution when a declared lock is missing', async () => {
    await expect(installFiles('declared-lock-checksum')).rejects.toMatchObject({
      code: 'PACKAGE_RESOLUTION_FAILED',
      message: 'File not found in package: yarn.lock',
    });
  });

  it('does not install an undeclared stray lock', async () => {
    await writeFile(join(extractedDir, 'yarn.lock'), lockBytes);
    await installFiles(null);
    expect(storedFiles.has(`${FileFolder.Dependencies}/yarn.lock`)).toBe(false);
  });
});
