import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdtemp, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const directory = dirname(fileURLToPath(import.meta.url));
const output =
  process.env.RAIL_EVIDENCE_DIR ||
  (await mkdtemp(join(tmpdir(), 'my-desk-rail-')));
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
        builder.onResolve({ filter: /^twenty-ui\/display$/ }, () => ({
          path: 'icons',
          namespace: 'fixture',
        }));
        builder.onResolve({ filter: /^twenty-shared\/types$/ }, () => ({
          path: 'paths',
          namespace: 'fixture',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
          contents:
            path === 'route'
              ? `export const callPropelRoute = async (_path, body) => (await fetch('/fixture/rail', { method:'POST', body:JSON.stringify(body) })).json();`
              : path === 'paths'
                ? `export const AppPath = { TasksPage: '/tasks', Inbox: '/inbox' };`
                : `import React from 'react'; export const IconCheck = () => React.createElement('span', null, '✓'); export const IconComment = () => React.createElement('span', null, '↩'); export const IconNotes = () => React.createElement('span', null, '≡'); export const IconPhone = () => React.createElement('span', null, '☎');`,
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
      : '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0}button{cursor:pointer}</style><div id="root"></div><script src="/fixture.js"></script>',
  );
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${server.address().port}`;
const target = {
  laneObject: 'lead',
  recordId: 'person-1',
  personId: 'person-1',
  phoneE164: '+971500000000',
  hasWhatsApp: true,
  contactName: 'Synthetic contact',
};
const sections = ['tasks', 'viewings', 'unreadWa', 'priorityLeads'];
const titles = [
  "Today's tasks",
  'Viewings today',
  'Unread WhatsApp',
  'Priority leads',
];
const healthy = () => ({
  ok: true,
  partial: false,
  sections: Object.fromEntries(
    sections.map((key) => [key, { status: 'available' }]),
  ),
  tasks: [
    {
      ...target,
      id: 'task-1',
      title: 'Synthetic task',
      status: 'TODO',
      slaDueAt: null,
      kind: null,
    },
  ],
  viewings: [
    {
      ...target,
      id: 'viewing-1',
      name: 'Synthetic viewing',
      status: 'SCHEDULED',
      scheduledAt: null,
    },
  ],
  unreadWa: [
    {
      ...target,
      id: 'wa-1',
      name: 'Synthetic chat',
      unreadCount: 2,
      lastMessageAt: null,
      contactId: 'person-1',
    },
  ],
  priorityLeads: [
    {
      ...target,
      id: 'lead:person-1',
      name: 'Synthetic lead',
      stage: 'NEW',
      meta: '',
      valueAed: null,
      nextAction: null,
      nextActionTaskId: null,
      nextActionDueAt: null,
      nextActionSource: 'stageMap',
      lastTouchAt: null,
      slaDeadline: null,
      snoozedUntil: null,
      unreadWa: 0,
      viewingTodayAt: null,
      taskDueToday: false,
    },
  ],
});
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
    const pending = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    let response = healthy();
    let hold = false;
    await page.route('**/*', async (route) => {
      const request = route.request();
      assert.ok(
        request.url().startsWith(url),
        'fixture must never contact an external host',
      );
      if (request.url().endsWith('/fixture/rail')) {
        assert.equal(
          request.postDataJSON().action,
          'rail',
          'retry may only read rail',
        );
        if (hold) {
          pending.push(route);
          return;
        }
        return route.fulfill({ json: response });
      }
      return route.continue();
    });
    for (const [index, section] of sections.entries()) {
      response = {
        ...healthy(),
        partial: true,
        [section]: [],
        sections: {
          ...healthy().sections,
          [section]: {
            status: 'unavailable',
            error: 'PRIVATE upstream failure',
          },
        },
      };
      await page.goto(url);
      await page
        .getByRole('button', { name: `Retry ${titles[index]}`, exact: true })
        .waitFor();
      assert.equal(await page.getByText(/PRIVATE/).count(), 0);
      if (section === 'unreadWa')
        assert.equal(await page.getByText(/all caught up/).count(), 0);
      if (section !== 'priorityLeads') {
        await page
          .getByRole('button', { name: 'Open Synthetic lead', exact: true })
          .click();
        assert.equal(
          await page
            .getByRole('status', { name: 'Fixture action' })
            .textContent()
            .catch(() =>
              page.locator('output[aria-label="Fixture action"]').textContent(),
            ),
          'open:person-1',
        );
      }
      await page.getByRole('button', { name: 'Calendar', exact: true }).click();
      await page.waitForFunction(
        () =>
          document.querySelector('output[aria-label="Fixture navigation"]')
            .textContent === '/objects/viewings',
      );
      await page.screenshot({
        path: join(output, `${profile.name}-${section}-unavailable.png`),
        fullPage: true,
      });
      response = healthy();
      await page
        .getByRole('button', { name: `Retry ${titles[index]}`, exact: true })
        .click();
      await page.getByText('Synthetic chat', { exact: true }).waitFor();
      await page.getByText('Synthetic task', { exact: true }).waitFor();
    }
    response = { ok: false, error: 'PRIVATE full error' };
    await page.goto(url);
    await page
      .getByRole('button', { name: "Retry Today's tasks", exact: true })
      .waitFor();
    response = healthy();
    await page
      .getByRole('button', { name: "Retry Today's tasks", exact: true })
      .click();
    await page.getByText('Synthetic task', { exact: true }).waitFor();
    hold = true;
    await page
      .getByRole('button', { name: 'Reload fixture', exact: true })
      .click();
    while (pending.length < 1)
      await new Promise((done) => setTimeout(done, 10));
    await page
      .getByRole('button', { name: 'Change scope', exact: true })
      .click();
    assert.equal(
      await page.getByText('Synthetic task', { exact: true }).count(),
      0,
      'old painted scope must be hidden',
    );
    while (pending.length < 2)
      await new Promise((done) => setTimeout(done, 10));
    await pending[1].fulfill({
      json: {
        ...healthy(),
        tasks: [{ ...healthy().tasks[0], title: 'Current scope task' }],
      },
    });
    await page.getByText('Current scope task', { exact: true }).waitFor();
    await pending[0].fulfill({
      json: {
        ...healthy(),
        tasks: [{ ...healthy().tasks[0], title: 'STALE scope task' }],
      },
    });
    await page.waitForTimeout(50);
    assert.equal(
      await page.getByText('STALE scope task', { exact: true }).count(),
      0,
    );
    assert.equal(
      await page.getByText('Current scope task', { exact: true }).count(),
      1,
    );
    await page.screenshot({
      path: join(output, `${profile.name}-recovered.png`),
      fullPage: true,
    });
    assert.deepEqual(errors, [], 'browser console must be clean');
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      'no horizontal overflow',
    );
    console.log(
      `${profile.name}: 4 partial failures + retry, full failure retry, healthy navigation/actions, scope change/late response PASS`,
    );
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
console.log(`Evidence: ${output}`);
