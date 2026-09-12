import { randomUUID } from 'node:crypto';

import request from 'supertest';

import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

/**
 * C0 deliverable 6 — "Compare to public API capabilities on this fork. Keep the
 * engine adapter only where atomicity/CAS cannot be met there."
 *
 * The engine adapter is a permanent compatibility cost: every change to it is an
 * image build and a service recreate, and it has to be re-proven on every Twenty
 * upgrade. That cost is only justified if the deployed PUBLIC API genuinely
 * cannot do the job. This measures it rather than assuming it.
 *
 * Two questions, deliberately separated:
 *   P1  can the public API do a compare-and-set?          (concurrency control)
 *   P2  can it commit two writes atomically?              (the receipt)
 */

const WORKSPACE_ID = SEED_APPLE_WORKSPACE_ID;
const SCHEMA = getWorkspaceSchemaName(WORKSPACE_ID);

const OWNER_A = 'C0-OWNER-A';
const OWNER_B = 'C0-OWNER-B';
const OWNER_C = 'C0-OWNER-C';

const raw = <T = unknown>(sql: string, params?: unknown[]): Promise<T[]> =>
  global.testDataSource.query(sql, params);

const graphql = (query: string, variables: Record<string, unknown> = {}) =>
  request(`http://localhost:${APP_PORT}`)
    .post('/graphql')
    .set('Authorization', `Bearer ${APPLE_JANE_ADMIN_ACCESS_TOKEN}`)
    .send({ query, variables });

describe('C0 — what the PUBLIC API can and cannot do (integration)', () => {
  let personId: string;

  beforeEach(async () => {
    personId = randomUUID();
    await raw(
      `INSERT INTO "${SCHEMA}".person (id, city, "position") VALUES ($1, $2, 1)`,
      [personId, OWNER_A],
    );
  });

  afterEach(async () => {
    await raw(`DELETE FROM "${SCHEMA}".person WHERE id = $1`, [personId]);
  });

  const readCity = async (): Promise<string | null> => {
    const rows = await raw<{ city: string | null }>(
      `SELECT city FROM "${SCHEMA}".person WHERE id = $1`,
      [personId],
    );

    return rows[0]?.city ?? null;
  };

  const UPDATE_PEOPLE = `
    mutation UpdatePeople($data: PersonUpdateInput!, $filter: PersonFilterInput!) {
      updatePeople(data: $data, filter: $filter) { id city }
    }
  `;

  it('P1 — the public API CAN do a compare-and-set', async () => {
    // Guard the write with the value we believe is current.
    const won = await graphql(UPDATE_PEOPLE, {
      data: { city: OWNER_B },
      filter: { id: { eq: personId }, city: { eq: OWNER_A } },
    });

    expect(won.body.errors).toBeUndefined();
    expect(won.body.data.updatePeople).toHaveLength(1);
    expect(await readCity()).toBe(OWNER_B);

    // The same guarded write again: the guard no longer matches, so it must
    // affect nothing rather than clobber the newer value.
    const lost = await graphql(UPDATE_PEOPLE, {
      data: { city: OWNER_C },
      filter: { id: { eq: personId }, city: { eq: OWNER_A } },
    });

    expect(lost.body.errors).toBeUndefined();
    expect(lost.body.data.updatePeople).toHaveLength(0);
    expect(await readCity()).toBe(OWNER_B);
  });

  it('P2 — but it CANNOT commit two writes atomically', async () => {
    // Two mutations in one document. GraphQL runs mutations in series, so the
    // first completes before the second is attempted.
    //
    // The second is made to fail at RUNTIME, not at validation: a document that
    // fails validation never runs the first mutation either, and would make this
    // test vacuous — it would "prove" atomicity by never testing it.
    const both = await graphql(
      `
        mutation TwoWrites($data: PersonUpdateInput!, $filter: PersonFilterInput!, $dup: [PersonCreateInput!]!) {
          first: updatePeople(data: $data, filter: $filter) { id city }
          second: createPeople(data: $dup) { id }
        }
      `,
      {
        data: { city: OWNER_B },
        filter: { id: { eq: personId } },
        // Same id as an existing row -> unique violation at runtime.
        dup: [{ id: personId, city: 'should-never-exist' }],
      },
    );

    // CONTROL: the second write must actually have failed. If it succeeded, this
    // test proves nothing about atomicity.
    expect(both.body.errors).toBeDefined();
    expect(both.body.errors.length).toBeGreaterThan(0);
    expect(both.body.data?.second ?? null).toBeNull();

    // THE FINDING: the first write survived the second one's failure. There is no
    // transaction across the two, so a public-API "assignment + receipt" would
    // leave exactly the split C0 exists to prevent.
    expect(await readCity()).toBe(OWNER_B);
  });
});
