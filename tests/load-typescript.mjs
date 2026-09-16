import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
// In-memory loader: no generated files, network, or external services.
export function loadTypeScript(relative, overrides = {}) {
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const loadedModule = { exports: {} };
    cache.set(filename, loadedModule);
    const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    const localRequire = (id) => {
      if (id in overrides) return overrides[id];
      if (id.startsWith("@/")) {
        const base = path.resolve(id.slice(2));
        const found = [".ts", ".tsx", ".mjs"]
          .map((ext) => base + ext)
          .find((p) => fs.existsSync(p));
        return load(found);
      }
      return require(id);
    };
    vm.runInThisContext("(function(require,module,exports){" + code + "\n})", {
      filename,
    })(localRequire, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  return load(path.resolve(relative));
}
