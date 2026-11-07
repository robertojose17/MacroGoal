'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require(process.env.TYPESCRIPT_MODULE || 'typescript');
const root = path.resolve(__dirname, '..');
const glyphMap = require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialIcons.json');

function transpile(source, fileName) {
  return ts.transpileModule(source, {
    fileName,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
      removeComments: true,
    },
  }).outputText;
}

function load(file, mocks = {}) {
  const exports = {};
  vm.runInNewContext(transpile(fs.readFileSync(path.join(root, file), 'utf8'), file), {
    exports,
    require(name) {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      throw new Error(`Unexpected runtime dependency: ${name}`);
    },
  }, { filename: file });
  return exports;
}

test('the public native theme contract does not change emitted implementation or enable dark mode', () => {
  const original = "export function useColorScheme() {\n  return 'light' as const;\n}\n";
  const updated = fs.readFileSync(path.join(root, 'hooks/useColorScheme.ts'), 'utf8');
  assert.equal(transpile(updated, 'useColorScheme.ts'), transpile(original, 'useColorScheme.ts'));
  const { useColorScheme: readFixedScheme } = load('hooks/useColorScheme.ts');
  for (let call = 0; call < 100; call++) assert.equal(readFixedScheme(), 'light');
});

test('every installed canonical Material glyph and its underscore alias resolve to the same existing glyph', () => {
  const { normalizeMaterialIconName } = load('utils/materialIconName.ts');
  const names = Object.keys(glyphMap);
  assert.ok(names.length > 2000, 'Must exercise the real installed glyph map, not a small mock');
  for (const name of names) {
    assert.equal(normalizeMaterialIconName(name, glyphMap), name);
    assert.equal(normalizeMaterialIconName(name.replace(/-/g, '_'), glyphMap), name);
  }
  for (const invalid of ['not_a_real_material_icon', 'calendar_tomorrow', 'local_fire-department', '__proto__', 'toString', '']) {
    assert.throws(() => normalizeMaterialIconName(invalid, glyphMap), /Unsupported Material icon/);
  }
});

test('Android/web IconSymbol passes the normalized glyph while preserving presentation props', () => {
  const iconNames = load('utils/materialIconName.ts');
  const MaterialIcons = Object.assign(function MaterialIcons() {}, { glyphMap });
  const { IconSymbol } = load('components/IconSymbol.tsx', {
    react: { createElement: (component, props) => ({ component, props }) },
    '@expo/vector-icons/MaterialIcons': MaterialIcons,
    '@/utils/materialIconName': iconNames,
  });
  const style = { opacity: 0.5 };
  const view = IconSymbol({ ios_icon_name: 'calendar', android_material_icon_name: 'calendar_today', size: 18, color: '#123456', style });
  assert.equal(view.component, MaterialIcons);
  assert.equal(view.props.name, 'calendar-today');
  assert.equal(view.props.size, 18);
  assert.equal(view.props.color, '#123456');
  assert.equal(view.props.style, style);
  assert.equal(IconSymbol({ android_material_icon_name: 'home', color: '#fff' }).props.name, 'home');
});
