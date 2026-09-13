import { type JestConfigWithTsJest } from 'ts-jest';
import 'tsconfig-paths/register';

import { UnhandledExceptionFilter } from 'src/filters/unhandled-exception.filter';
import { rawDataSource } from 'src/database/typeorm/raw/raw.datasource';

import { createApp } from 'test/integration/utils/create-app';

export default async (_: unknown, projectConfig: JestConfigWithTsJest) => {
  const app = await createApp({ appInitHook: async (app) => { app.useGlobalFilters(new UnhandledExceptionFilter()); } });

  if (!projectConfig.globals) {
    throw new Error('No globals found in project config');
  }

  await rawDataSource.initialize();

  await app.listen(projectConfig.globals.APP_PORT as number);

  global.app = app;
  global.testDataSource = rawDataSource;
};
