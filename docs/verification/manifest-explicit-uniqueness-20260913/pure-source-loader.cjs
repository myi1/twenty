// Deliberately independent of every Jest/global setup and datasource.
// Local imports are deferred until an export is used. Only allowlisted pure
// source paths can execute; unused application converters are never evaluated.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

exports.createSourceLoader = (repository, dependencyPackageJson) => {
  const dependencyRequire = createRequire(dependencyPackageJson);
  const ts = dependencyRequire('typescript');
  const cache = new Map();
  const executed = [];
  const allowedExternal = new Set([
    'twenty-shared/types',
    'twenty-shared/utils',
    'twenty-shared/metadata',
    'twenty-shared/constants',
    '@sniptt/guards',
    'uuid',
    'microdiff',
    'crypto',
  ]);
  const allowedSource = [
    /^src\/engine\/core-modules\/application\/application-manifest\/(converters|services|utils)\//,
    /^src\/engine\/core-modules\/application\/application\.exception$/,
    /^src\/engine\/metadata-modules\/[^/]+\/(utils|constants?|types|exceptions)\//,
    /^src\/engine\/workspace-manager\/workspace-migration\/universal-flat-entity\/(utils|constants|types)\//,
    /^src\/engine\/utils\//,
  ];
  function load(id) {
    if (cache.has(id)) return cache.get(id);
    if (!allowedSource.some((pattern) => pattern.test(id))) {
      throw new Error(`Source execution denied: ${id}`);
    }
    const filename = path.join(
      repository,
      'packages/twenty-server',
      `${id}.ts`,
    );
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        experimentalDecorators: true,
        emitDecoratorMetadata: false,
        esModuleInterop: true,
      },
    }).outputText;
    const exports = {};
    cache.set(id, exports);
    executed.push(id);
    vm.runInNewContext(
      code,
      {
        exports,
        require: (request) => {
          // No Nest container or application is imported or started.
          if (request === '@nestjs/common')
            return { Injectable: () => (type) => type };
          if (request === '@lingui/core/macro')
            return {
              msg: (strings, ...args) => String.raw({ raw: strings }, ...args),
              t: (strings, ...args) => String.raw({ raw: strings }, ...args),
            };
          if (allowedExternal.has(request)) return dependencyRequire(request);
          if (request.startsWith('./') || request.startsWith('../'))
            request = path.posix.join(path.posix.dirname(id), request);
          if (!request.startsWith('src/'))
            throw new Error(`Dependency denied: ${request}`);
          return new Proxy(
            {},
            {
              get: (_, key) =>
                key === '__esModule' ? true : load(request)[key],
            },
          );
        },
      },
      { filename },
    );
    return exports;
  }
  return { load, executed };
};
