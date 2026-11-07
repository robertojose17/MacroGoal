const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require(process.env.TYPESCRIPT_MODULE||'typescript');
const root = process.env.SEARCH_AUTHORITY_FUNCTIONS_ROOT || path.resolve(__dirname, '../../../supabase/functions');
exports.root = root;
exports.compile = function compile(file, overrides = {}, globals = {}) {
  const source = fs.readFileSync(file, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const localRequire = spec => {
    if (Object.hasOwn(overrides, spec)) return overrides[spec];
    const resolved = spec.startsWith('.') ? path.resolve(path.dirname(file), spec) : spec;
    if (resolved.endsWith('.ts')) return compile(resolved, overrides, globals);
    return require(resolved);
  };
  const run = vm.runInThisContext('(function(require,module,exports,Deno,fetch){' + output + '\n})', { filename: file });
  run(localRequire, module, module.exports, globals.Deno || { env: { get: () => '' }, serve: () => {} }, globals.fetch || (() => { throw new Error('Unexpected external fetch'); }));
  return module.exports;
};
exports.endpoint = (admin, providerFetch) => exports.compile(path.join(root, 'search-foods/index.ts'), {
  'jsr:@supabase/functions-js/edge-runtime.d.ts': {},
  'jsr:@supabase/supabase-js@2': { createClient: () => admin },
}, { fetch: providerFetch });
