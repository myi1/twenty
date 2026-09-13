import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';
import { chromium } from 'playwright';

const directory = dirname(fileURLToPath(import.meta.url));
const output =
  process.env.A2A_RESPONSE_EVIDENCE_DIR ||
  (await mkdtemp(join(tmpdir(), 'a2a-response-')));
await mkdir(output, { recursive: true });

await build({
  entryPoints: [join(directory, 'fixture.tsx')],
  bundle: true,
  outfile: join(output, 'fixture.js'),
  platform: 'browser',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [
    {
      name: 'synthetic-boundaries',
      setup(builder) {
        builder.onResolve(
          { filter: /^@\/propel\/lib\/callPropelRoute$/ },
          () => ({ path: 'route', namespace: 'fixture' }),
        );
        builder.onResolve({ filter: /^@\/propel\/lib\/a2aCrm$/ }, () => ({
          path: 'crm',
          namespace: 'fixture',
        }));
        builder.onResolve({ filter: /^@\/propel\// }, ({ path }) => {
          const barePath = resolve(
            directory,
            '../../../src/modules/propel',
            path.slice('@/propel/'.length),
          );
          const resolvedPath = ['.ts', '.tsx', '']
            .map((extension) => `${barePath}${extension}`)
            .find(existsSync);
          assert.ok(resolvedPath, `cannot resolve fixture import ${path}`);
          return { path: resolvedPath };
        });
        builder.onResolve({ filter: /^twenty-ui\/display$/ }, () => ({
          path: 'icons',
          namespace: 'fixture',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
          contents:
            path === 'route'
              ? `export const callPropelRoute = async (path, body) => {
                  const response = await fetch('/fixture/route', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path, body }) });
                  const text = await response.text();
                  return text ? JSON.parse(text) : null;
                };`
              : path === 'crm'
                ? `export const createCounterpartyPerson = async () => null;
                   export const linkCounterpartyToAgreement = async () => true;
                   export const searchCounterpartyPeople = async () => [];`
                : `import React from 'react';
                   const I = () => React.createElement('span', {'aria-hidden': true}, '•');
                   export const IconAlertTriangle=I, IconCheck=I, IconCopy=I, IconLink=I, IconMail=I, IconSend=I, IconUserPlus=I;`,
          loader: 'js',
          resolveDir: resolve(directory, '../../../../..'),
        }));
      },
    },
  ],
});

const javascript = await readFile(join(output, 'fixture.js'));
const server = createServer((request, response) => {
  response.setHeader(
    'Content-Type',
    request.url === '/fixture.js' ? 'text/javascript' : 'text/html',
  );
  response.end(
    request.url === '/fixture.js'
      ? javascript
      : '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;font-family:system-ui}button{margin:4px}</style><div id="root"></div><script src="/fixture.js"></script>',
  );
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const address = server.address();
assert.ok(address !== null && typeof address === 'object');
const url = `http://127.0.0.1:${address.port}`;

const browser = await chromium.launch({ headless: true });
try {
  for (const profile of [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'phone', width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height },
      isMobile: profile.name === 'phone',
      hasTouch: profile.name === 'phone',
    });
    const page = await context.newPage();
    const errors = [];
    const calls = [];
    const heldSends = [];
    let dealState = { agreement: null };
    let status = { status: 'DRAFT' };
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.route('**/*', async (route) => {
      const request = route.request();
      assert.ok(
        request.url().startsWith(url),
        'fixture contacted an external host',
      );
      if (!request.url().endsWith('/fixture/route')) return route.continue();
      const input = request.postDataJSON();
      calls.push(input.path);
      if (input.path === '/a2a/deal-state')
        return route.fulfill({ json: dealState });
      if (input.path === '/a2a/create-draft') {
        return route.fulfill({
          json: {
            kind: 'ok',
            ok: true,
            a2aDocumentId: 'browser-document',
            documensoDocumentId: '22',
            ourRecipientToken: 'our-token',
            counterpartyRecipientToken: 'other-token',
            isRera: true,
          },
        });
      }
      if (input.path === '/a2a/send') {
        heldSends.push(route);
        return;
      }
      if (input.path === '/a2a/status') return route.fulfill({ json: status });
      if (input.path === '/a2a/discard')
        return route.fulfill({ json: { ok: true } });
      return route.fulfill({ body: 'null' });
    });

    await page.goto(url);
    const create = page.getByRole('button', { name: 'Create fixture draft' });
    await create.waitFor();
    await assert.doesNotReject(() => create.click());
    await page
      .getByRole('button', { name: 'Finish fixture signature' })
      .click();
    await page.getByRole('button', { name: 'Add fixture broker' }).click();
    const send = page.getByRole('button', { name: /Email the link to/ });
    await send.click();
    await page.getByText('Send confirmation pending').waitFor();
    assert.equal(await send.isDisabled(), true);
    assert.equal(calls.filter((path) => path === '/a2a/send').length, 1);
    assert.equal(calls.includes('/a2a/discard'), false);
    await page.screenshot({
      path: join(output, `${profile.name}-pending.png`),
      fullPage: true,
    });

    await heldSends[0].fulfill({
      body: 'null',
      contentType: 'application/json',
    });
    await page.getByText('Send result needs checking').waitFor();
    assert.equal(await send.isDisabled(), true);
    assert.equal(await page.getByText(/starting over are blocked/).count(), 1);
    await page.screenshot({
      path: join(output, `${profile.name}-unknown.png`),
      fullPage: true,
    });

    dealState = {
      agreement: {
        a2aDocumentId: 'browser-document',
        documensoDocumentId: '22',
        status: 'DRAFT',
      },
    };
    await page
      .getByRole('button', { name: 'Unmount studio', exact: true })
      .click();
    await page.getByText('Studio unmounted').waitFor();
    await page
      .getByRole('button', { name: 'Mount studio', exact: true })
      .click();
    await page.getByText('Send result needs checking').waitFor();
    assert.equal(calls.includes('/a2a/discard'), false);

    await page.getByRole('button', { name: 'Check document status' }).click();
    await page.waitForTimeout(20);
    assert.equal(await page.getByText('Send result needs checking').count(), 1);
    status = { status: 'OUT_FOR_SIGNATURE', counterpartySigningUrl: null };
    await page.getByRole('button', { name: 'Check document status' }).click();
    await page.getByText(/Document activation is confirmed/).waitFor();
    assert.equal(await page.getByText(/delivered|sent to/i).count(), 0);
    assert.deepEqual(errors, []);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    process.stdout.write(
      `${profile.name}: pending, unknown, duplicate block, remount guard, DRAFT hold, activation-only reconciliation PASS\n`,
    );
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
process.stdout.write(`Evidence: ${output}\n`);
