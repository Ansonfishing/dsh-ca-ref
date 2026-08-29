// contract: 插件入口契约 —— node --check 全源文件 + package.json/cordis 形状
//          + seed 钉版完整性 + apply(fake ctx) 注册 4 工具 1 命令 + 命令通道行为。
//          隔离:临时 DSH_HOME + 空 CAREF_CORPUS,不依赖本机真实语料与生产库。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL(".", import.meta.url)));
const home = mkdtempSync(join(tmpdir(), "caref-contract-"));
const corpus = mkdtempSync(join(tmpdir(), "caref-contract-corpus-"));
process.env.DSH_HOME = home;
process.env.CAREF_CORPUS = corpus;
test.after(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(corpus, { recursive: true, force: true });
});

test("node --check 通过全部源文件", () => {
  for (const f of ["index.js", "lib/client.js"]) {
    const r = spawnSync(process.execPath, ["--check", join(root, f)], { encoding: "utf8" });
    assert.equal(r.status, 0, `node --check ${f} failed: ${r.stderr}`);
  }
});

test("package.json + cordis.patch.yml 形状", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(pkg.name, "dsh-ca-ref");
  assert.equal(pkg.type, "module");
  assert.equal(pkg.main, "./index.js");
  assert.equal(pkg.dsh.bundle.patch, "./cordis.patch.yml");
  assert.equal(pkg.exports["./client"].default, "./lib/client.js");
  assert.equal(pkg.license, "MIT");
  assert.match(readFileSync(join(root, "cordis.patch.yml"), "utf8"), /id:\s*dsh-ca-ref/);
});

test("seed/repos.json: 8 仓钉版完整(name/remote/lang/sha/verify_cmd)", () => {
  const seed = JSON.parse(readFileSync(join(root, "seed", "repos.json"), "utf8"));
  assert.equal(seed.repos.length, 8);
  const langs = new Set();
  for (const r of seed.repos) {
    assert.ok(r.name, "repo name missing");
    assert.ok(r.remote, `remote missing for ${r.name}`);
    assert.ok(r.lang, `lang missing for ${r.name}`);
    assert.match(r.sha, /^[0-9a-f]{40}$/, `sha not 40-hex for ${r.name}`);
    assert.ok(r.note, `note missing for ${r.name}`);
    if (r.verified === "pass") {
      assert.ok(r.verify_cmd, `verify_cmd missing for verified repo ${r.name}`);
    }
    langs.add(r.lang);
  }
  for (const lang of ["go", "java", "csharp", "python"]) {
    assert.ok(langs.has(lang), `language ${lang} 缺少参考仓`);
  }
});

let byName;
test("apply(fake ctx): 4 工具 + 1 命令注册", async () => {
  const m = await import("../index.js");
  assert.equal(m.name, "dsh-ca-ref");
  assert.ok(Array.isArray(m.inject) && m.inject.includes("tools"), "inject 需含 tools");

  const tools = [];
  const cmds = [];
  const ctx = {
    get: (k) => {
      if (k === "tools") return { register: (t) => tools.push(t) };
      if (k === "commands") return { register: (c) => cmds.push(c) };
      return null;
    },
    interval: () => () => {},
    on: () => {},
    effect: (fn) => { try { fn(); } catch { /* ignore */ } },
    logger: { warn: () => {} },
  };
  m.apply(ctx);
  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    ["ca_ref_baseline", "ca_ref_record", "ca_ref_search", "ca_ref_status"].sort(),
    "必须注册全部 4 个 ca_ref_* 工具",
  );
  assert.equal(cmds.length, 1);
  assert.equal(cmds[0].name, "ca-ref");
  const search = tools.find((t) => t.name === "ca_ref_search");
  assert.deepEqual(search.parameters.required, ["query"]);
  // 工具描述与基线一致:8 仓(6 仓首发 + Python 2 仓补位),不能残留旧「6 仓」表述
  const statusTool = tools.find((t) => t.name === "ca_ref_status");
  assert.match(statusTool.description, /8 仓钉版/);
  assert.doesNotMatch(statusTool.description, /6 仓/);
  byName = Object.fromEntries(tools.map((t) => [t.name, t]));
});

test("命令通道: status/record/stats 行为契约(空语料不崩)", async () => {
  const m = await import("../index.js");
  // 重新 apply 拿命令 handler(上面 apply 的 handler 未留存)
  const cmds = [];
  const ctx = {
    get: (k) => (k === "commands" ? { register: (c) => cmds.push(c) } : null),
    interval: () => () => {},
    on: () => {},
    effect: () => {},
    logger: { warn: () => {} },
  };
  m.apply(ctx);
  assert.equal(cmds.length, 1);
  const handler = cmds[0].handler;

  const status = JSON.parse(handler({ rawInput: "status --json" }).text);
  assert.ok(Array.isArray(status.repos), "status.repos 需为数组");
  assert.equal(typeof status.index.chunks, "number");

  const rec = await byName.ca_ref_record.execute({
    project: "contract-proj",
    language: "go",
    findings: [{ rule_id: "dep-model-app", severity: "red", evidence: "a.go:1 import gorm" }],
  });
  assert.match(rec, /已留审查账 r_/);

  const stats = JSON.parse(handler({ rawInput: "stats --json" }).text);
  assert.equal(stats.ruleHits["dep-model-app"], 1, "留账后规则命中应 +1");

  const bad = handler({ rawInput: "nope" });
  assert.equal(bad.kind, "error", "未知子命令应返回 error");
});
