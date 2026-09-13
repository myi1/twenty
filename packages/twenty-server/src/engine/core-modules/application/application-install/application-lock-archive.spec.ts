import { packApplication } from '../../../../../../twenty-sdk/src/cli/utilities/build/common/pack-application';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Manifest } from 'twenty-shared/application';
import { FileFolder } from 'twenty-shared/types';
import { extractTarballSecurely } from '../application-package/utils/extract-tarball-securely.util';
import { resolvePackageContentDir } from '../application-package/utils/tarball-utils';
import { ApplicationInstallService } from './application-install.service';

const md5 = (bytes: Buffer) => createHash('md5').update(bytes).digest('hex');

describe('SDK archive to installer dependency storage', () => {
  let fixture: string;
  let output: string;
  const packageBytes = Buffer.from(
    '{"name":"archive-fixture","version":"1.0.0"}\n',
  );
  const lockBytes = Buffer.from(
    '# preserve CRLF\r\n__metadata:\r\n  version: 8\r\n',
  );
  const npmPack = async () => {
    const result = execFileSync(
      'npm',
      [
        'pack',
        '--pack-destination',
        '.',
        '--ignore-scripts',
        '--offline',
        '--json',
      ],
      {
        cwd: output,
        timeout: 20000,
        env: {
          ...process.env,
          npm_config_cache: join(fixture, 'cache'),
          npm_config_registry: 'http://127.0.0.1:1',
          npm_config_ignore_scripts: 'true',
          npm_config_offline: 'true',
        },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    return join(output, JSON.parse(result)[0].filename);
  };
  const archive = () => packApplication(output);
  beforeEach(async () => {
    jest.useRealTimers();
    fixture = await mkdtemp(join(tmpdir(), 'sdk-lock-archive-'));
    output = join(fixture, 'output');
    await mkdir(output);
    await writeFile(join(output, 'package.json'), packageBytes);
  });
  afterEach(async () => {
    await rm(fixture, { recursive: true, force: true });
  });
  const prepare = async (withLock: boolean) => {
    const manifest = {
      application: {
        packageJsonChecksum: md5(packageBytes),
        yarnLockChecksum: withLock ? md5(lockBytes) : null,
      },
      logicFunctions: [{ builtHandlerPath: 'functions/handler.mjs' }],
      frontComponents: [{ builtComponentPath: 'components/browser.mjs' }],
      publicAssets: [{ filePath: 'public/example.txt' }],
    } as unknown as Manifest;
    const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
    await writeFile(join(output, 'manifest.json'), manifestBytes);
    if (withLock) await writeFile(join(output, 'yarn.lock'), lockBytes);
    for (const [name, bytes] of Object.entries({
      'functions/handler.mjs': 'export default 1;',
      'functions/handler.mjs.map': '{}',
      'components/browser.mjs': 'export default 2;',
      'components/browser.mjs.map': '{}',
      'public/example.txt': 'asset',
    })) {
      await mkdir(join(output, name, '..'), { recursive: true });
      await writeFile(join(output, name), bytes);
    }
    return { manifest, manifestBytes };
  };
  const extract = async (archivePath: string) => {
    const directory = await mkdtemp(join(fixture, 'extract-'));
    await extractTarballSecurely(archivePath, directory);
    return resolvePackageContentDir(directory);
  };
  it.each([true, false])(
    'preserves exact package, manifest and declared dependencies across archive/extraction/storage (lock=%s)',
    async (withLock) => {
      const { manifest, manifestBytes } = await prepare(withLock);
      const content = await extract(await archive());
      expect(await readFile(join(content, 'package.json'))).toEqual(
        packageBytes,
      );
      expect(await readFile(join(content, 'manifest.json'))).toEqual(
        manifestBytes,
      );
      if (withLock)
        expect(await readFile(join(content, 'yarn.lock'))).toEqual(lockBytes);
      else
        await expect(
          readFile(join(content, 'yarn.lock')),
        ).rejects.toMatchObject({ code: 'ENOENT' });
      const files = new Map<string, Buffer>();
      const service: ApplicationInstallService = Object.create(
        ApplicationInstallService.prototype,
      );
      Object.assign(service, {
        fileStorageService: {
          writeFile: async (params: {
            fileFolder: FileFolder;
            resourcePath: string;
            sourceFile: Buffer;
          }) => {
            files.set(
              `${params.fileFolder}/${params.resourcePath}`,
              params.sourceFile,
            );
          },
        },
      });
      await service['writeFilesToStorage'](
        content,
        manifest,
        'application-fixture',
        'workspace-fixture',
      );
      expect(files.get(`${FileFolder.Dependencies}/package.json`)).toEqual(
        packageBytes,
      );
      expect(files.get(`${FileFolder.Source}/manifest.json`)).toEqual(
        manifestBytes,
      );
      if (withLock)
        expect(md5(files.get(`${FileFolder.Dependencies}/yarn.lock`)!)).toBe(
          manifest.application.yarnLockChecksum,
        );
      for (const name of [
        'functions/handler.mjs',
        'functions/handler.mjs.map',
        'components/browser.mjs',
        'components/browser.mjs.map',
        'public/example.txt',
      ])
        expect(await readFile(join(content, name))).toEqual(
          await readFile(join(output, name)),
        );
    },
  );
  it('demonstrates the original npm archive omits a declared root lock', async () => {
    await prepare(true);
    const content = await extract(await npmPack());
    await expect(readFile(join(content, 'yarn.lock'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('refuses a missing declared lock before publishing an archive', async () => {
    await prepare(true);
    await rm(join(output, 'yarn.lock'));
    await expect(archive()).rejects.toThrow('Missing yarn.lock');
    expect(
      (await readdir(output)).some(
        (name) => name.endsWith('.tgz') || name.startsWith('.twenty-archive-'),
      ),
    ).toBe(false);
  });

  it.each(['package.json', 'yarn.lock'])(
    'refuses changed %s bytes instead of archiving a stale checksum',
    async (name) => {
      await prepare(true);
      await writeFile(join(output, name), 'changed');
      await expect(archive()).rejects.toThrow(`Checksum mismatch for ${name}`);
    },
  );

  it('does not nest previous archives or temporary state on repeated packing', async () => {
    await prepare(true);
    await writeFile(join(output, 'old-version.tgz'), 'stale');
    await mkdir(join(output, '.twenty-archive-stale'));
    await writeFile(join(output, '.twenty-archive-stale', 'secret'), 'stale');
    await archive();
    const content = await extract(await archive());
    expect(await readdir(content)).not.toEqual(
      expect.arrayContaining(['application.tgz']),
    );
    expect(await readdir(content)).not.toEqual(
      expect.arrayContaining(['old-version.tgz']),
    );
    expect(await readdir(content)).not.toEqual(
      expect.arrayContaining(['.twenty-archive-stale']),
    );
    expect(
      (await readdir(output)).filter((name) =>
        name.startsWith('.twenty-archive-'),
      ),
    ).toEqual(['.twenty-archive-stale']);
  });

  it('rejects out-of-tree symbolic links without copying their contents', async () => {
    await prepare(true);
    await writeFile(join(fixture, 'outside'), 'outside-content');
    await symlink(join(fixture, 'outside'), join(output, 'leak'));
    await expect(archive()).rejects.toThrow(
      'Cannot archive symbolic link: leak',
    );
    expect(
      (await readdir(output)).some((name) =>
        name.startsWith('.twenty-archive-'),
      ),
    ).toBe(false);
  });

  it('preserves a declared archive public asset', async () => {
    const { manifest } = await prepare(false);
    manifest.publicAssets.push({
      filePath: 'download.tgz',
    } as Manifest['publicAssets'][number]);
    await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest));
    await writeFile(join(output, 'download.tgz'), 'public-archive');
    const content = await extract(await archive());
    expect(await readFile(join(content, 'download.tgz'), 'utf8')).toBe(
      'public-archive',
    );
  });

  it('preserves public assets that match the preferred archive destination', async () => {
    const { manifest } = await prepare(false);
    manifest.publicAssets.push({
      filePath: 'application.tgz',
    } as Manifest['publicAssets'][number]);
    await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest));
    await writeFile(join(output, 'application.tgz'), 'public-archive');
    const archivePath = await archive();
    expect(archivePath).not.toBe(join(output, 'application.tgz'));
    const content = await extract(archivePath);
    expect(await readFile(join(content, 'application.tgz'), 'utf8')).toBe(
      'public-archive',
    );
    expect(await readFile(join(output, 'application.tgz'), 'utf8')).toBe(
      'public-archive',
    );
    expect(
      (await readdir(output)).some((name) =>
        name.startsWith('.twenty-archive-'),
      ),
    ).toBe(false);
  });
  it('treats at-prefixed asset names as files rather than tar include directives', async () => {
    const { manifest } = await prepare(false);
    manifest.publicAssets.push({
      filePath: '@download',
    } as Manifest['publicAssets'][number]);
    await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest));
    await writeFile(join(output, '@download'), 'literal-asset');
    const content = await extract(await archive());
    expect(await readFile(join(content, '@download'), 'utf8')).toBe(
      'literal-asset',
    );
  });

  it('removes its temporary snapshot after a final rename failure', async () => {
    await prepare(false);
    await mkdir(join(output, 'application.tgz'));
    await expect(archive()).rejects.toThrow();
    expect(
      (await readdir(output)).some((name) =>
        name.startsWith('.twenty-archive-'),
      ),
    ).toBe(false);
  });
});
