import {
  type ArgumentsHost,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

import { UnhandledExceptionFilter } from 'src/filters/unhandled-exception.filter';

/**
 * What PRODUCTION sends back when the command route refuses.
 *
 * The integration harness registers MockedUnhandledExceptionFilter; production
 * registers UnhandledExceptionFilter in main.ts. A refusal body observed through
 * the harness therefore says nothing about production. This runs the REAL
 * production filter class. Only the Express response object is a stand-in, and it
 * records exactly what the filter writes.
 *
 * Why it matters: the command worker tells STALE_VERSION from IDEMPOTENCY_CONFLICT
 * by the `code` in a 409 body. If production dropped it, every stale version would
 * become an UNKNOWN outcome that an operator has to reconcile by hand.
 */

const run = (exception: unknown) => {
  const written: { status?: number; json?: unknown } = {};
  const response = {
    headersSent: false,
    header: () => response,
    status(code: number) {
      written.status = code;

      return response;
    },
    json(body: unknown) {
      written.json = body;

      return response;
    },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;

  new UnhandledExceptionFilter().catch(exception, host);

  return written;
};

describe('production error body for command-route refusals', () => {
  it('keeps the contract code and reason on a 403', () => {
    const written = run(
      new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'The person this command acts for may not issue it: NOT_A_MANAGER.',
      }),
    );

    expect(written.status).toBe(403);
    expect(written.json).toEqual({
      code: 'FORBIDDEN',
      message: 'The person this command acts for may not issue it: NOT_A_MANAGER.',
    });
  });

  it('keeps STALE_VERSION on a 409, which the worker classifies by', () => {
    const written = run(
      new ConflictException({ code: 'STALE_VERSION', message: 'Expected 0, found 1' }),
    );

    expect(written.status).toBe(409);
    expect(written.json).toMatchObject({ code: 'STALE_VERSION' });
  });

  it('CONTROL — the stand-in response really records what the filter writes (a non-HTTP error differs)', () => {
    const written = run(new Error('boom'));

    expect(written.status).toBe(500);
    expect(written.json).toBe('boom');
  });
});
