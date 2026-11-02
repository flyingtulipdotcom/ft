// Exercise the legacy consumers affected by the security overrides. No RPC or compiler.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { promisify } = require("node:util");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const from = (name) => createRequire(require.resolve(`${name}/package.json`));
const hh = from("hardhat");
const coverage = from("solidity-coverage");
const fixture = fs.mkdtempSync(path.join(root, "node_modules", "tooling-"));
const checks = [];
const check = async (name, run) => {
  await run();
  checks.push(name);
};

async function main() {
  fs.writeFileSync(path.join(fixture, "keep.js"), "module.exports = 1;");
  fs.writeFileSync(path.join(fixture, "skip.js"), "module.exports = 2;");
  fs.writeFileSync(path.join(fixture, "private.js"), "module.exports = 3;");
  fs.mkdirSync(path.join(fixture, "nested"));
  fs.writeFileSync(path.join(fixture, "nested/private.js"), "module.exports = 3;");
  for (const [name, req] of [
    ["Hardhat Mocha", hh],
    ["root Mocha", require],
  ]) {
    await check(`${name}: file discovery and ignore patterns`, () => {
      const collect = req("mocha/lib/cli/collect-files");
      const result = collect({
        file: [],
        spec: [path.join(fixture, "*.js")],
        ignore: ["**/skip.js"],
        extension: ["js"],
        recursive: false,
        sort: true,
      });
      assert.deepEqual(
        result.files,
        ["keep.js", "private.js"].map((f) => path.join(fixture, f)),
      );
    });
  }
  await check("Glob 14: compiled CJS/ESM and raw entrypoints keep bounded matching", async () => {
    const globRequire = from("typechain");
    const globRoot = path.dirname(globRequire.resolve("glob/package.json"));
    const variants = [
      globRequire("glob"),
      globRequire("glob/raw"),
      await import(pathToFileURL(path.join(globRoot, "dist/esm/index.min.js"))),
      await import(pathToFileURL(path.join(globRoot, "dist/esm/index.js"))),
    ];
    for (const api of variants) {
      assert.deepEqual(api.globSync("*.js", { cwd: fixture, ignore: ["skip.js"] }).sort(), ["keep.js", "private.js"]);
      // Glob caps expansion at 10,000 results even for attacker-sized ranges.
      assert(new api.Glob("{1..1000000}", {}).patterns.length <= 10000);
      assert.equal(api.hasMagic("+(keep|private).js"), true);
    }
  });
  const matcher = coverage("sc-istanbul/lib/util/file-matcher");
  await check("coverage: include, exclude, absolute paths and realpath matcher", async () => {
    const filesFor = promisify(matcher.filesFor);
    assert.deepEqual(
      (await filesFor({ root: fixture, includes: ["*.js"], excludes: ["skip.js"], relative: true })).sort(),
      ["keep.js", "private.js"],
    );
    const files = await filesFor({ root: fixture, includes: ["keep.js"] });
    assert.deepEqual(files, [path.join(fixture, "keep.js")]);
    const match = await promisify(matcher.matcherFor)({ root: fixture, includes: ["keep.js"] });
    assert.equal(match(path.join(fixture, "keep.js")), true);
    assert.equal(match(path.join(fixture, "skip.js")), undefined);
    await assert.rejects(filesFor({ root: fixture, includes: [null] }), TypeError);
  });
  const deleteEmpty = createRequire(coverage.resolve("delete-empty/package.json"));
  const eslint8 = createRequire(from("@layerzerolabs/eslint-config-next").resolve("eslint/package.json"));
  const entryCache = createRequire(eslint8.resolve("file-entry-cache/package.json"));
  const flatCache = createRequire(entryCache.resolve("flat-cache/package.json"));
  for (const [name, req] of [
    ["rimraf 3", flatCache],
    ["rimraf 2", deleteEmpty],
  ]) {
    await check(`${name}: callback glob removes matches and preserves exclusions`, async () => {
      assert.equal(req("rimraf/package.json").version[0], name.slice(-1));
      const remove = promisify(req("rimraf"));
      fs.writeFileSync(path.join(fixture, "one.delete"), "delete");
      fs.writeFileSync(path.join(fixture, "two.delete"), "delete");
      await remove(path.join(fixture, "*.delete"));
      assert(!fs.existsSync(path.join(fixture, "one.delete")));
      assert(!fs.existsSync(path.join(fixture, "two.delete")));
      assert(fs.existsSync(path.join(fixture, "keep.js")));
      await remove(path.join(fixture, "*.delete"));
    });
  }
  await check("Hardhat Deploy Axios: inherited method and form visitor cannot change requests", async () => {
    const deploy = from("hardhat-deploy");
    const axios = deploy("axios");
    assert.equal(deploy("axios/package.json").version, "0.34.0");
    const previousMethod = Object.getOwnPropertyDescriptor(Object.prototype, "method");
    const previousVisitor = Object.getOwnPropertyDescriptor(Object.prototype, "visitor");
    let visited = false;
    try {
      Object.defineProperty(Object.prototype, "method", { value: "DELETE", writable: true, configurable: true });
      Object.defineProperty(Object.prototype, "visitor", {
        value: () => {
          visited = true;
          return false;
        },
        configurable: true,
      });
      const response = await axios.request({
        url: "https://example.invalid",
        adapter: async (config) => ({ data: "", status: 200, statusText: "OK", headers: {}, config }),
      });
      assert.equal(response.config.method, "get");
      const fields = [];
      axios.toFormData({ nested: { value: "ok" } }, { append: (...field) => fields.push(field) });
      assert.equal(visited, false);
      assert.deepEqual(fields, [["nested[value]", "ok"]]);
      assert.equal(
        axios.getUri({ url: "https://example.invalid/probe", params: { a: 1 } }),
        "https://example.invalid/probe?a=1",
      );
    } finally {
      if (previousMethod) Object.defineProperty(Object.prototype, "method", previousMethod);
      else delete Object.prototype.method;
      if (previousVisitor) Object.defineProperty(Object.prototype, "visitor", previousVisitor);
      else delete Object.prototype.visitor;
    }
  });
  const plugin = from("@layerzerolabs/eslint-config-next")("eslint-plugin-import");
  const { Linter } = require("eslint");
  function lint(rule, options, source) {
    const linter = new Linter({ configType: "eslintrc" });
    linter.defineRule(`import/${rule}`, plugin.rules[rule]);
    return linter.verify(
      source,
      {
        parserOptions: { ecmaVersion: 2020, sourceType: "module" },
        rules: { [`import/${rule}`]: ["error", ...options] },
      },
      { filename: path.join(fixture, "input.js") },
    );
  }
  function pair(rule, options, good, bad) {
    assert.deepEqual(lint(rule, options, good), [], `${rule}: valid import`);
    const errors = lint(rule, options, bad);
    assert(
      errors.some((e) => e.ruleId === `import/${rule}`),
      `${rule}: invalid import must still be rejected`,
    );
    assert(!errors.some((e) => e.fatal), `${rule}: parser failure is not rule validation`);
  }
  await check("import/no-unassigned-import: allow glob and rejection", () =>
    pair("no-unassigned-import", [{ allow: ["node:fs"] }], "import 'node:fs';", "import 'node:path';"),
  );
  await check("import/no-namespace: ignored glob and rejection", () =>
    pair(
      "no-namespace",
      [{ ignore: ["node:fs"] }],
      "import * as fs from 'node:fs';",
      "import * as path from 'node:path';",
    ),
  );
  await check("import/no-internal-modules: forbid and allow matchers", () => {
    pair("no-internal-modules", [{ forbid: ["**/private.js"] }], "import './keep.js';", "import './private.js';");
    assert.deepEqual(lint("no-internal-modules", [{ allow: ["**/private.js"] }], "import './nested/private.js';"), []);
    assert(
      lint("no-internal-modules", [{ allow: ["**/keep.js"] }], "import './nested/private.js';").some(
        (e) => e.ruleId === "import/no-internal-modules",
      ),
    );
  });
  await check("import/no-import-module-exports: exception glob and rejection", () => {
    const source = "import fs from 'node:fs'; module.exports = fs;";
    assert.deepEqual(lint("no-import-module-exports", [{ exceptions: ["**/input.js"] }], source), []);
    assert(
      lint("no-import-module-exports", [{ exceptions: ["**/other.js"] }], source).some(
        (e) => e.ruleId === "import/no-import-module-exports",
      ),
    );
  });
  await check("import/no-extraneous-dependencies: dev dependency filename glob", () => {
    const source = "import chai from 'chai';";
    assert.deepEqual(
      lint("no-extraneous-dependencies", [{ devDependencies: ["**/*.js"], packageDir: root }], source),
      [],
    );
    assert(
      lint("no-extraneous-dependencies", [{ devDependencies: ["**/*.ts"], packageDir: root }], source).some(
        (e) => e.ruleId === "import/no-extraneous-dependencies",
      ),
    );
  });
  await check("import/order: path group glob and rejection", () =>
    pair(
      "order",
      [
        {
          pathGroups: [{ pattern: "node:fs", group: "builtin", position: "before" }],
          pathGroupsExcludedImportTypes: [],
        },
      ],
      "import fs from 'node:fs';\nimport path from 'node:path';",
      "import path from 'node:path';\nimport fs from 'node:fs';",
    ),
  );
  await check("import/extensions: path group override and rejection", () => {
    const options = ["always", { pathGroupOverrides: [{ pattern: "**/keep.js", action: "ignore" }] }];
    assert.deepEqual(lint("extensions", options, "import './keep.js';"), []);
    assert(lint("extensions", options, "import './private';").some((e) => e.ruleId === "import/extensions"));
  });
  console.log(JSON.stringify({ node: process.version, checks: checks.length, passed: checks }, null, 2));
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => fs.rmSync(fixture, { recursive: true, force: true }));
