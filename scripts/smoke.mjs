/**
 * dsh-ca-ref 服务端冒烟测试(mock ctx,不起 dsh)。
 * 运行: node scripts/smoke.mjs（在本目录）
 */
import { setTimeout as wait } from "node:timers/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// 隔离:冒烟库放临时 DSH_HOME,不碰生产 ~/.dsh/ca-ref/caref.db
const TMP_HOME = mkdtempSync(join(tmpdir(), "caref-smoke-"));
process.env.DSH_HOME = TMP_HOME;
const m = await import("../index.js");

const tools = [];
const cmds = [];
const intervals = [];
const ctx = {
  get: (k) => {
    if (k === "tools") return { register: (t) => tools.push(t) };
    if (k === "commands") return { register: (c) => cmds.push(c) };
    return null;
  },
  interval: (ms, fn) => { intervals.push(ms); return () => {}; },
  on: () => {},
  effect: (fn) => { try { fn(); } catch { /* cleanup fn, ignore in smoke */ } },
  logger: { warn: () => {} },
};

let failures = 0;
function check(label, cond, extra = "") {
  console.log((cond ? "PASS" : "FAIL") + " " + label + (extra ? " | " + extra : ""));
  if (!cond) failures++;
}

check("export name", m.name === "dsh-ca-ref", m.name);
check("export inject", Array.isArray(m.inject) && m.inject.includes("tools"), JSON.stringify(m.inject));

m.apply(ctx);
check("4 tools registered", tools.length === 4, tools.map((t) => t.name).join(","));
check("ca-ref command registered", cmds.length === 1 && cmds[0].name === "ca-ref");
check("daily interval registered", intervals.length === 1 && intervals[0] === 24 * 3600 * 1000, String(intervals[0]));

await wait(6000); // 等启动 3s 后的懒索引
const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
const cmd = cmds[0];

const status = await byName.ca_ref_status.execute({});
check("status: 6 repos", /🟢 go-clean-template/.test(status) && /⚪ library/.test(status), status.split("\n").length + " lines");
check("status: index built", /索引: \d+ chunks/.test(status) && !/未建/.test(status), status.split("\n")[1]);

const sGo = await byName.ca_ref_search.execute({ query: "domain layer must not depend on framework", language: "go" });
check("search(go, ascii): hits in go repos", /go-clean-template|wild-workouts/.test(sGo), sGo.split("\n").length + " lines");

const sCjk = await byName.ca_ref_search.execute({ query: "依赖方向" });
check("search(中文): hits", !/^无命中/.test(sCjk), sCjk.split("\n").slice(0, 2).join(" | "));

const sTest = await byName.ca_ref_search.execute({ query: "Command_Should_Be_Immutable", kind: "test" });
check("search(kind=test): C# immut test", /modular-monolith-with-ddd/.test(sTest) && /ApplicationTests\.cs/.test(sTest));

const sRule = await byName.ca_ref_search.execute({ query: "haveSimpleNameNotEndingWith", kind: "test" });
check("search(ArchUnit suffix rule): ttulka", /ddd-example-ecommerce/.test(sRule));

const bGo = await byName.ca_ref_baseline.execute({ language: "go" });
check("baseline(go): 2 go repos + rules + flags", /go-clean-template/.test(bGo) && /dep-model-app/.test(bGo) && /红旗清单/.test(bGo));

const bAll = await byName.ca_ref_baseline.execute({});
check("baseline(all): 8 repos listed", (bAll.match(/— 基线|pass|read-only/g) || []).length >= 8 && /wild-workouts/.test(bAll) && /fastapi/.test(bAll));

// ---- Python 基线(补位:django-oscar + fastapi) ----
const sPy = await byName.ca_ref_search.execute({ query: "include the same APIRouter instance", language: "python", kind: "test" });
check("search(python, kind=test): fastapi import guard chunked", /fastapi/.test(sPy) && /test_router_circular_import/.test(sPy) && /test_router_circular_import\b/.test(sPy), sPy.split("\n").slice(0, 2).join(" | "));
const sPy2 = await byName.ca_ref_search.execute({ query: "abstract_models", language: "python" });
check("search(python): django-oscar structure hit", /django-oscar/.test(sPy2), sPy2.split("\n").slice(0, 2).join(" | "));
const bPy = await byName.ca_ref_baseline.execute({ language: "python" });
check("baseline(python): 2 py repos + py rules + cards", /django-oscar/.test(bPy) && /fastapi/.test(bPy) && /py-import-guard/.test(bPy) && /目录骨架/.test(bPy));
check("baseline(python): stale '不覆盖 Python' note removed", !/不覆盖 Python/.test(bPy));

const rec = await byName.ca_ref_record.execute({
  project: "smoke-proj", language: "go",
  findings: [
    { rule_id: "dep-model-app", severity: "red", evidence: "entity/user.go:12 import gorm", source_ref: "library:src/test/groovy/.../LendingHexagonalArchitectureTest.java" },
    { rule_id: "go-err-handling", severity: "yellow" },
  ],
});
check("record: returns id", /^已留审查账 r_/.test(rec), rec);

const statsJson = JSON.parse(cmd.handler({ rawInput: "stats --json" }).text);
check("cmd stats: rule hits recorded", statsJson.ruleHits["dep-model-app"] === 1 && statsJson.ruleHits["go-err-handling"] === 1, JSON.stringify(statsJson.ruleHits));
check("cmd stats: repo hits recorded", (statsJson.repoHits["_baseline"] || 0) >= 1 || Object.keys(statsJson.repoHits).length > 0, JSON.stringify(statsJson.repoHits));

const ledgerJson = JSON.parse(cmd.handler({ rawInput: "ledger 10 --json" }).text);
check("cmd ledger: has review + search events", ledgerJson.events.some((e) => e.kind === "review") && ledgerJson.events.some((e) => e.kind === "search"), ledgerJson.events.length + " events");
const rev = ledgerJson.events.find((e) => e.kind === "review");
check("cmd ledger: review findings parsed", Array.isArray(rev?.findings) && rev.findings.length === 2);

const statusJson = JSON.parse(cmd.handler({ rawInput: "status --json" }).text);
check("cmd status json: repos+index", statusJson.repos.length === 8 && typeof statusJson.index.chunks === "number");
const go = statusJson.repos.find((r) => r.name === "go-clean-template");
check("cmd status json: repo has card (markdown body)", typeof go.card === "string" && /目录骨架/.test(go.card), "card len=" + (go.card || "").length);
check("cmd status json: repo has rule coverage", Array.isArray(go.rules) && go.rules.length > 0 && go.rules.every((r) => "id" in r && "severity" in r && "section" in r && "check" in r), "rules=" + go.rules.length);

const searchJson = cmd.handler({ rawInput: "search 模块白名单 --json" });
check("cmd search json: ok", searchJson.kind === "success" && Array.isArray(JSON.parse(searchJson.text).results));

const reindex = cmd.handler({ rawInput: "reindex" });
check("cmd reindex: works", reindex.kind === "success" && /chunks/.test(reindex.text), reindex.text);

const bad = cmd.handler({ rawInput: "nope" });
check("cmd unknown: error", bad.kind === "error");

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
try { rmSync(TMP_HOME, { recursive: true, force: true }); } catch { /* ignore */ }
process.exit(failures === 0 ? 0 : 1);
