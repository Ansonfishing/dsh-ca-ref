/**
 * dsh-ca-ref — Clean Architecture 参考库(agent 审查基线)
 *
 * 语料: ~/AI/ca-ref/（可用 CAREF_CORPUS 环境变量覆盖） 下 8 个钉版参考仓(6 仓 + Python 2 仓) + 基线文档(AGENT-REVIEW-BASELINE.md /
 *       rules.yml / cards/)。只读消费语料,插件自身状态存 ~/.dsh/ca-ref/caref.db。
 *
 * 服务端能力:
 *   tools:  ca_ref_search / ca_ref_baseline / ca_ref_record / ca_ref_status
 *   commands: /ca-ref status|search|baseline|ledger|stats|reindex(观察窗面板的
 *            只读数据通道;--json 输出结构化数据)
 *   timer:  每日 tick —— git rev-parse HEAD 校验 8 仓钉版漂移 + 重建索引(只读,
 *            不自动 re-clone/跑验证命令,那是 P3 agent 的事)
 *
 * @module dsh-ca-ref
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

export const name = "dsh-ca-ref";
export const inject = ["tools", "commands", "timer"];

const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), ".dsh");
const CAREF_DIR = join(DSH_HOME, "ca-ref");
const DB_PATH = join(CAREF_DIR, "caref.db");
const CORPUS = process.env.CAREF_CORPUS ?? join(homedir(), "AI", "ca-ref");
const TICK_MS = 24 * 3600 * 1000;
const MAX_FILE_BYTES = 300 * 1024;
const LEDGER_CAP = 2000;

const SEED = JSON.parse(readFileSync(join(import.meta.dirname, "seed", "repos.json"), "utf8"));
const REPOS = SEED.repos;

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "bin", "obj", ".idea", "target", "build", ".next", "coverage", ".mvn"]);

/** 各仓要索引的架构测试源文件(dir 为仓内相对路径前缀,re 匹配文件相对该 dir 的路径)。 */
const TEST_SOURCES = [
  { repo: "ddd-example-ecommerce", dirs: ["src/test"], re: /ArchTest\.java$/ },
  { repo: "library", dirs: ["src/test"], re: /(HexagonalArchitectureTest|ModularArchitectureTest)\.java$/ },
  { repo: "modular-monolith-with-ddd", dirs: ["src/Modules/UserAccess/Tests/ArchTests"], re: /\.cs$/ },
  { repo: "hexagonal-architecture-spring-boot", dirs: ["coffeeshop-application/src/test", "coffeeshop-infrastructure/src/test"], re: /Test(s)?\.java$/ },
  { repo: "fastapi", dirs: ["tests"], re: /test_router_circular_import\.py$/ },
];

/* ------------------------------------------------------------------ */
/* db                                                                  */
/* ------------------------------------------------------------------ */

let db = null;

function getDb() {
  if (db) return db;
  mkdirSync(CAREF_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS repos (
      name TEXT PRIMARY KEY, remote TEXT, lang TEXT, sha TEXT, last_commit TEXT,
      verified TEXT, verified_at TEXT, verify_cmd TEXT, note TEXT,
      head TEXT, index_state TEXT DEFAULT 'pending', indexed_at INTEGER
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      repo, path, symbol, kind, lang, text, tokenize='unicode61'
    );
    CREATE TABLE IF NOT EXISTS ledger (
      id TEXT PRIMARY KEY, kind TEXT, project TEXT, language TEXT, query TEXT, detail TEXT, created_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_ledger_created ON ledger(created_at DESC);
    CREATE TABLE IF NOT EXISTS repo_hits (repo TEXT PRIMARY KEY, hits INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS rule_hits (rule_id TEXT PRIMARY KEY, hits INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
  `);
  const has = db.prepare("SELECT name FROM sqlite_master WHERE name='repos' AND type='table'").get();
  if (has) {
    for (const r of REPOS) {
      db.prepare(`INSERT OR IGNORE INTO repos (name, remote, lang, sha, last_commit, verified, verified_at, verify_cmd, note)
                 VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(r.name, r.remote, r.lang, r.sha, r.last_commit, r.verified, r.verified_at ?? "", r.verify_cmd ?? "", r.note ?? "");
    }
  }
  return db;
}

function now() { return Date.now(); }
function id(prefix) { return prefix + "_" + randomUUID().slice(0, 12); }

function metaGet(key) {
  const row = getDb().prepare("SELECT value FROM meta WHERE key=?").get(key);
  return row ? row.value : null;
}
function metaSet(key, value) {
  getDb().prepare("INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, String(value));
}

function logLine(msg) {
  const d = getDb();
  const lines = (metaGet("log") || "").split("\n").slice(-19);
  lines.push(new Date(now()).toISOString().slice(0, 16).replace("T", " ") + " " + msg);
  metaSet("log", lines.join("\n"));
}

/* ------------------------------------------------------------------ */
/* indexer                                                             */
/* ------------------------------------------------------------------ */

function walkFiles(dir, rel, depth, maxDepth, out, cap) {
  if (depth > maxDepth || out.length >= cap) return out;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const en of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (en.name.startsWith(".") || SKIP_DIRS.has(en.name)) continue;
    const r = rel ? rel + "/" + en.name : en.name;
    if (en.isDirectory()) walkFiles(join(dir, en.name), r, depth + 1, maxDepth, out, cap);
    else out.push(r);
    if (out.length >= cap) break;
  }
  return out;
}

/** md 按 1-3 级标题切块。 */
function chunkMarkdown(text) {
  const lines = String(text).split("\n");
  const out = [];
  let sym = "";
  let buf = [];
  const flush = () => {
    const t = buf.join("\n").trim();
    if (t) out.push({ symbol: sym, text: t });
    buf = [];
  };
  for (const line of lines) {
    if (/^#{1,3} /.test(line)) { flush(); sym = line.replace(/^#{1,3} /, "").trim(); }
    buf.push(line);
  }
  flush();
  return out;
}

/** 架构测试源码按测试方法切块:注解行(@Test/@ArchTest/[Test])起新块。 */
function chunkTestFile(text) {
  const lines = String(text).split("\n");
  const out = [];
  let cur = null;
  const ANN = /^\s*(@Test\b|@ArchTest\b|\[Test\])/;
  for (const line of lines) {
    if (ANN.test(line)) {
      if (cur) out.push(cur);
      cur = { symbol: "", lines: [line] };
      continue;
    }
    if (!cur) continue; // 文件头(package/using/imports)不入库
    if (!cur.symbol) {
      const m = line.match(/\b(?:void|ArchRule)\s+(\w+)\s*[=(]/) || line.match(/\bpublic\s+void\s+(\w+)/);
      if (m) cur.symbol = m[1];
    }
    cur.lines.push(line);
    if (cur.lines.length > 150) { out.push(cur); cur = null; } // 保险丝
  }
  if (cur) out.push(cur);
  return out.map((c) => ({ symbol: c.symbol, text: c.lines.join("\n").trim() })).filter((c) => c.text.length > 0);
}

/** Python 架构守护测试:按 `def `/`class ` 起始行切块。 */
function chunkPythonTestFile(text) {
  const lines = String(text).split("\n");
  const out = [];
  let cur = null;
  for (const line of lines) {
    const m = line.match(/^\s*(?:async\s+)?(?:def|class)\s+([A-Za-z_]\w*)/);
    if (m) {
      if (cur) out.push(cur);
      cur = { symbol: m[1], lines: [line] };
      continue;
    }
    if (!cur) continue; // 文件头(docstring/imports)不入库
    cur.lines.push(line);
    if (cur.lines.length > 150) { out.push(cur); cur = null; } // 保险丝
  }
  if (cur) out.push(cur);
  return out.map((c) => ({ symbol: c.symbol, text: c.lines.join("\n").trim() })).filter((c) => c.text.length > 0);
}

/** 目录骨架(顶层 2 层全量,更深层只列目录 + 配置文件)。 */
function buildStructure(root) {
  const out = [];
  const walk = (dir, rel, depth) => {
    if (depth > 3 || out.length > 400) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const en of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (en.name.startsWith(".") || SKIP_DIRS.has(en.name)) continue;
      const r = rel ? rel + "/" + en.name : en.name;
      if (en.isDirectory()) {
        out.push(r + "/");
        walk(join(dir, en.name), r, depth + 1);
      } else if (depth <= 1 || /\.(ya?ml|toml|mod|work|Taskfile\.\w+|golangci\.\w+)$/i.test(en.name)) {
        out.push(r);
      }
      if (out.length > 400) return;
    }
  };
  walk(root, "", 0);
  return out.join("\n");
}

/** 逐行解析 rules.yml 的 rules: / red_flags: 段(不引第三方 YAML 依赖)。 */
function parseRulesYaml() {
  const p = join(CORPUS, "rules.yml");
  if (!existsSync(p)) return { rules: [], flags: [] };
  const lines = readFileSync(p, "utf8").split("\n");
  const rules = [];
  const flags = [];
  let section = null;
  let cur = null;
  for (const line of lines) {
    if (/^rules:\s*$/.test(line)) { section = "rules"; cur = null; continue; }
    if (/^red_flags:\s*$/.test(line)) { section = "flags"; cur = null; continue; }
    if (/^\S/.test(line)) { section = null; cur = null; continue; }
    if (!section) continue;
    const idm = line.match(/^  - id:\s*(\S+)/);
    if (idm) {
      cur = { id: idm[1] };
      (section === "rules" ? rules : flags).push(cur);
    }
    if (!cur) continue;
    const m = line.match(/^\s{4}(check|lang|section|severity|template|warning|note|source):\s*(.*)$/);
    if (m) {
      const v = m[2].trim();
      if (m[1] === "source") {
        const repo = v.match(/repo:\s*([^,\s}]+)/)?.[1]?.trim() ?? "";
        const path = v.match(/path:\s*([^}]+?)\s*\}?$/)?.[1]?.trim() ?? "";
        cur.source = [repo, path].filter(Boolean).join(":");
      } else {
        cur[m[1]] = v;
      }
    }
  }
  return { rules, flags };
}

function ensureIndexed(log) {
  const last = Number(metaGet("last_index_at") || 0);
  const count = Number(metaGet("chunks") || 0);
  if (last && count > 0 && now() - last < TICK_MS) return;
  reindexAll(log);
}

function reindexAll(log) {
  const d = getDb();
  d.exec("DELETE FROM chunks_fts");
  const ins = d.prepare("INSERT INTO chunks_fts (repo, path, symbol, kind, lang, text) VALUES (?,?,?,?,?,?)");
  let n = 0;
  const add = (repo, path, symbol, kind, lang, text) => {
    const t = String(text || "").trim();
    if (!t) return;
    ins.run(repo, path, symbol || "", kind, lang, t);
    n++;
  };

  // 1) 基线文档
  for (const f of ["AGENT-REVIEW-BASELINE.md", "MANIFEST.md", "REPORT.md"]) {
    const p = join(CORPUS, f);
    if (!existsSync(p)) continue;
    for (const c of chunkMarkdown(readFileSync(p, "utf8"))) add("_baseline", f, c.symbol, "doc", "generic", c.text);
  }
  // 2) rules.yml 逐条规则
  const { rules, flags } = parseRulesYaml();
  for (const r of rules) {
    add("_baseline", "rules.yml", r.id, "rule", r.lang || "generic",
      [r.id, `[${r.section}][${r.lang || "generic"}][${r.severity || "yellow"}]`, r.check, r.template ? "template: " + r.template : null, r.warning ? "note: " + r.warning : null]
        .filter(Boolean).join("\n"));
  }
  for (const f of flags) {
    add("_baseline", "rules.yml", f.id, "flag", "generic", [f.id, f.check].filter(Boolean).join("\n"));
  }
  // 3) pattern cards
  for (const repo of REPOS) {
    const p = join(CORPUS, "cards", repo.name + ".md");
    if (existsSync(p)) add(repo.name, "cards/" + repo.name + ".md", "card", "card", repo.lang, readFileSync(p, "utf8"));
  }
  // 4) 各仓:md 文档 + 架构测试源文件 + golangci.yml + 目录骨架
  for (const repo of REPOS) {
    const root = join(CORPUS, repo.name);
    if (!existsSync(root)) continue;
    for (const rel of walkFiles(root, "", 0, 3, [], 300)) {
      if (!rel.endsWith(".md") || /^(CHANGELOG|CONTRIBUTING|LICENSE)\.md$/i.test(rel)) continue;
      const p = join(root, rel);
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.size > MAX_FILE_BYTES) continue;
      for (const c of chunkMarkdown(readFileSync(p, "utf8"))) add(repo.name, rel, c.symbol, "doc", repo.lang, c.text);
    }
    for (const ts of TEST_SOURCES.filter((t) => t.repo === repo.name)) {
      for (const dirRel of ts.dirs) {
        const dir = join(root, dirRel);
        if (!existsSync(dir)) continue;
        for (const rel of walkFiles(dir, dirRel, 0, 4, [], 200)) {
          const sub = rel.slice(dirRel.length + 1);
          if (!ts.re.test(sub)) continue;
          const p = join(root, rel);
          let st;
          try { st = statSync(p); } catch { continue; }
          if (st.size > MAX_FILE_BYTES) continue;
          const chunker = rel.endsWith(".py") ? chunkPythonTestFile : chunkTestFile;
          for (const c of chunker(readFileSync(p, "utf8"))) add(repo.name, rel, c.symbol, "test", repo.lang, c.text);
        }
      }
    }
    if (repo.name === "go-clean-template") {
      const g = join(root, ".golangci.yml");
      if (existsSync(g)) add(repo.name, ".golangci.yml", "", "config", "go", readFileSync(g, "utf8"));
    }
    add(repo.name, "(structure)", "", "structure", repo.lang, buildStructure(root));
  }

  const at = now();
  metaSet("last_index_at", at);
  metaSet("chunks", n);
  for (const r of REPOS) d.prepare("UPDATE repos SET index_state='ok', indexed_at=? WHERE name=?").run(at, r.name);
  if (log) log(`reindex: ${n} chunks`);
  return n;
}

/* ------------------------------------------------------------------ */
/* search                                                              */
/* ------------------------------------------------------------------ */

function jsSnippet(text, terms, width = 110) {
  const t = String(text || "");
  let idx = -1;
  for (const term of terms) {
    if (!term) continue;
    const i = t.toLowerCase().indexOf(term.toLowerCase());
    if (i >= 0 && (idx === -1 || i < idx)) idx = i;
  }
  const flat = t.replace(/\s+/g, " ");
  if (idx < 0) return flat.slice(0, width * 2) + (flat.length > width * 2 ? "…" : "");
  const s = Math.max(0, idx - width);
  const e = Math.min(t.length, idx + width * 2);
  return (s ? "…" : "") + t.slice(s, e).replace(/\s+/g, " ") + (e < t.length ? "…" : "");
}

function search(query, { language, kind, limit = 8 } = {}) {
  const d = getDb();
  ensureIndexed();
  const q = String(query || "").trim();
  if (!q) throw new Error("query 不能为空");
  const limitN = Math.max(1, Math.min(25, Number(limit) || 8));
  const ascii = [...q.matchAll(/[A-Za-z_][A-Za-z0-9_+#./-]*/g)].map((m) => m[0].toLowerCase());
  const cjk = [...q.matchAll(/[\u4e00-\u9fff]{2,}/g)].map((m) => m[0]);
  if (!ascii.length && !cjk.length) throw new Error("query 无可检索词");

  const where = [];
  const args = [];
  const hasFts = ascii.length > 0;
  if (hasFts) {
    where.push("chunks_fts MATCH ?");
    args.push(ascii.map((t) => `"${t.replaceAll('"', "")}"`).join(" OR "));
  }
  if (cjk.length) {
    where.push("(" + cjk.map(() => "text LIKE ?").join(" OR ") + ")");
    for (const t of cjk) args.push("%" + t + "%");
  }
  let sql = `SELECT repo, path, symbol, kind, lang, text${hasFts ? ", bm25(chunks_fts) AS score" : ""} FROM chunks_fts WHERE ` + where.join(" OR ");
  if (language) { sql += " AND lang IN (?, 'generic')"; args.push(String(language).toLowerCase()); }
  if (kind) { sql += " AND kind = ?"; args.push(String(kind)); }
  sql += ` ORDER BY ${hasFts ? "score" : "repo, path"} LIMIT ?`;
  args.push(limitN);
  const rows = d.prepare(sql).all(...args);

  // 去重(同一 repo+path+symbol 可能同时命中 FTS 与 LIKE)
  const seen = new Map();
  for (const r of rows) {
    const k = r.repo + "|" + r.path + "|" + r.symbol;
    const score = hasFts ? r.score : 1;
    if (!seen.has(k) || score < seen.get(k).score) seen.set(k, { ...r, score });
  }
  const results = [...seen.values()]
    .sort((a, b) => a.score - b.score)
    .slice(0, limitN)
    .map((r) => ({
      repo: r.repo,
      path: r.path,
      symbol: r.symbol,
      kind: r.kind,
      lang: r.lang,
      score: Number(scoreRound(r.score)),
      snippet: jsSnippet(r.text, [...ascii, ...cjk]),
    }));

  // 台账 + 命中计数
  for (const repo of new Set(results.map((r) => r.repo))) {
    d.prepare("INSERT INTO repo_hits(repo,hits) VALUES(?,1) ON CONFLICT(repo) DO UPDATE SET hits=hits+1").run(repo);
  }
  const lid = id("s");
  d.prepare("INSERT INTO ledger (id, kind, project, language, query, detail, created_at) VALUES (?,?,?,?,?,?,?)")
    .run(lid, "search", "", language ? String(language) : "", q, JSON.stringify({ hits: results.length, repos: [...new Set(results.map((r) => r.repo))] }), now());
  trimLedger();
  return results;
}

function scoreRound(x) { return Math.round(Number(x) * 1e4) / 1e4; }

function trimLedger() {
  getDb().prepare("DELETE FROM ledger WHERE id NOT IN (SELECT id FROM ledger ORDER BY created_at DESC LIMIT ?)").run(LEDGER_CAP);
}

function recordReview({ project, language, findings = [] }) {
  const d = getDb();
  const p = String(project || "").trim();
  if (!p) throw new Error("project 不能为空");
  const sev = new Set(["red", "yellow", "ok"]);
  const list = findings.filter((f) => f && typeof f.rule_id === "string" && typeof f.rule_id !== "undefined");
  for (const f of list) {
    if (!sev.has(f.severity)) f.severity = "yellow";
  }
  const lid = id("r");
  d.prepare("INSERT INTO ledger (id, kind, project, language, query, detail, created_at) VALUES (?,?,?,?,?,?,?)")
    .run(lid, "review", p, language ? String(language) : "", "", JSON.stringify({ findings: list }), now());
  for (const f of list) {
    d.prepare("INSERT INTO rule_hits(rule_id,hits) VALUES(?,1) ON CONFLICT(rule_id) DO UPDATE SET hits=hits+1").run(f.rule_id);
  }
  trimLedger();
  return lid;
}

/* ------------------------------------------------------------------ */
/* payload builders(命令通道与工具共用)                                */
/* ------------------------------------------------------------------ */

/** 仓钉版卡全文（存在则给，缺失则 null）。 */
function readCard(repo) {
  const p = join(CORPUS, "cards", repo + ".md");
  return existsSync(p) ? readFileSync(p, "utf8") : null;
}

/** 按 rules.yml 的 source.repo 归因：仓库名 → {id,severity,section,check}[]。
 *  源不在 8 仓基线内（如 clean-code-typescript）自然不出现在任何仓的规则表。 */
function repoRulesMap() {
  const { rules } = parseRulesYaml();
  const map = new Map();
  for (const r of rules) {
    const srcRepo = r.source && r.source.split(":")[0];
    if (!srcRepo) continue;
    if (!map.has(srcRepo)) map.set(srcRepo, []);
    map.get(srcRepo).push({ id: r.id, severity: r.severity || "yellow", section: r.section || "", check: r.check || "" });
  }
  return map;
}

function statusPayload() {
  const d = getDb();
  const repos = d.prepare("SELECT * FROM repos ORDER BY name").all();
  const rulesMap = repoRulesMap();
  return {
    corpus: CORPUS,
    db: DB_PATH,
    index: { at: Number(metaGet("last_index_at") || 0), chunks: Number(metaGet("chunks") || 0) },
    repos: repos.map((r) => ({
      name: r.name, lang: r.lang, sha: r.sha, last_commit: r.last_commit,
      verified: r.verified, verified_at: r.verified_at, index_state: r.index_state,
      head_drift: r.head && r.head !== r.sha, note: r.note,
      card: readCard(r.name), rules: (rulesMap.get(r.name) || []),
    })),
  };
}

function ledgerPayload(limit = 50, kind) {
  const d = getDb();
  const n = Math.max(1, Math.min(200, Number(limit) || 50));
  const rows = kind
    ? d.prepare("SELECT * FROM ledger WHERE kind=? ORDER BY created_at DESC LIMIT ?").all(kind, n)
    : d.prepare("SELECT * FROM ledger ORDER BY created_at DESC LIMIT ?").all(n);
  return { events: rows.map((r) => ({ ...r, findings: r.kind === "review" ? safeParse(r.detail)?.findings : undefined })) };
}

function statsPayload() {
  const d = getDb();
  const repoHits = Object.fromEntries(d.prepare("SELECT repo, hits FROM repo_hits ORDER BY hits DESC").all().map((r) => [r.repo, r.hits]));
  const ruleHits = Object.fromEntries(d.prepare("SELECT rule_id, hits FROM rule_hits ORDER BY hits DESC").all().map((r) => [r.rule_id, r.hits]));
  const { rules } = parseRulesYaml();
  const zeroHitRules = rules.filter((r) => !(r.id in ruleHits)).map((r) => r.id);
  const totals = Object.fromEntries(d.prepare("SELECT kind, COUNT(*) n FROM ledger GROUP BY kind").all().map((r) => [r.kind, r.n]));
  return { repoHits, ruleHits, zeroHitRules, totals };
}

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

function baselinePayload(language) {
  const lang = (language || "").toLowerCase();
  const { rules, flags } = parseRulesYaml();
  const sel = rules.filter((r) => !r.lang || r.lang === "generic" || r.lang === lang);
  const d = getDb();
  const repos = d.prepare("SELECT * FROM repos ORDER BY name").all();
  const cardRepos = lang ? repos.filter((r) => r.lang === lang) : repos;
  const cards = cardRepos
    .map((r) => {
      const p = join(CORPUS, "cards", r.name + ".md");
      return existsSync(p) ? readFileSync(p, "utf8") : `# ${r.name}\n(card 缺失: cards/${r.name}.md)`;
    });
  return { language: lang || "generic", rules: sel, red_flags: flags, repos: cardRepos, cards };
}

function baselineText(p) {
  const lines = [];
  lines.push(`# CA 基线(language=${p.language})`);
  lines.push("");
  lines.push(`## 仓摘要(${p.repos.length} 仓${p.language ? ";已附摘要卡" : ";细节见 cards/<repo>.md"},引用时附 repo:path)`);
  for (const r of p.repos) {
    lines.push(`- ${r.name} [${r.lang}] ${r.verified} @ ${String(r.sha).slice(0, 12)} (last ${r.last_commit})${r.note ? " — " + r.note : ""}`);
    if (p.language) {
      const body = p.cards.find((c) => c.startsWith("# " + r.name + "(")) || p.cards.find((c) => c.includes(r.name));
      if (body) { lines.push(""); lines.push(body.trim()); }
    }
  }
  lines.push("");
  lines.push(`## 规则(${p.rules.length} 条,${p.language === "generic" ? "全部 generic 规则" : "generic + " + p.language})`);
  for (const r of p.rules) {
    lines.push(`- [${r.severity || "yellow"}][§${r.section}] ${r.id}: ${r.check}`);
    if (r.template) lines.push(`    template: ${r.template}`);
    if (r.source) lines.push(`    source: ${r.source}`);
    if (r.warning) lines.push(`    ⚠️ ${r.warning}`);
  }
  lines.push("");
  lines.push(`## 红旗清单(${p.red_flags.length} 条,出现即报)`);
  for (const f of p.red_flags) lines.push(`- ${f.id}: ${f.check}`);
  lines.push("");
  lines.push("## 如实说明");
  lines.push("- library 停更 2022、ddd-example-ecommerce 停更 2023:代码当断言模板,不当现代最佳实践引用");
  lines.push("- Python 基线(补位):django-oscar=应用级(17 个 bounded-context app,无 ArchUnit 式架构测试,引用其结构+lint 基线);fastapi=框架级(DI 依赖方向参考,仅 1 个 import 环守护测试,勿当应用项目引);oscar 的 DB fixture 测试需 postgres");
  return lines.join("\n");
}

function searchText(results) {
  if (!results.length) return "无命中。可换词、放宽 language/kind 过滤,或用 ca_ref_baseline 拿基线。";
  return results.map((r, i) =>
    `${i + 1}. [${r.score}] ${r.repo} · ${r.path}${r.symbol ? " → " + r.symbol : ""} (${r.kind}/${r.lang})\n   ${r.snippet}`
  ).join("\n") + "\n\n引用格式: <repo>:<path>[:symbol];引用前可 read 源文件原文核对。";
}

function statsText(s) {
  const fmt = (o) => Object.keys(o).length ? Object.entries(o).map(([k, v]) => `${k} ${v}`).join(", ") : "(暂无)";
  return [
    `仓命中: ${fmt(s.repoHits)}`,
    `规则命中: ${fmt(s.ruleHits)}`,
    `0 命中规则 ${s.zeroHitRules.length} 条: ${s.zeroHitRules.length ? s.zeroHitRules.join(", ") : "(全部命中过)"}`,
    `台账: ${fmt(s.totals)}`,
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* command(/ca-ref 面板通道)                                           */
/* ------------------------------------------------------------------ */

function runCmd(invocation) {
  const raw = String(invocation?.rawInput ?? "").trim();
  const parts = raw.length ? raw.split(/\s+/) : [];
  const sub = parts[0];
  const rest = parts.slice(1);
  const wantJson = rest.includes("--json");
  const args = rest.filter((p) => !p.startsWith("--"));
  const send = (text, json) => ({ kind: "success", text: wantJson && json !== undefined ? JSON.stringify(json) : text });
  try {
    switch (sub) {
      case undefined:
      case "":
      case "status": {
        const json = statusPayload();
        return send([
          `CA 参考库 · 语料 ${json.corpus}`,
          `索引: ${json.index.chunks} chunks @ ${json.index.at ? new Date(json.index.at).toISOString().slice(0, 16).replace("T", " ") : "未建"}`,
          ...json.repos.map((r) => `${r.verified === "pass" ? "🟢" : "⚪"} ${r.name} [${r.lang}] @ ${String(r.sha).slice(0, 8)}${r.head_drift ? " ⚠️ HEAD 漂移" : ""}(${r.verified})`),
        ].join("\n"), json);
      }
      case "search": {
        const query = args.join(" ");
        if (!query) return { kind: "error", text: "用法: /ca-ref search <query> [--json]" };
        const results = search(query, { limit: 12 });
        return send(searchText(results), { results });
      }
      case "baseline": {
        const p = baselinePayload(args[0]);
        return send(baselineText(p), p);
      }
      case "ledger": {
        const json = ledgerPayload(Number(args[0]) || 50);
        const text = json.events.length
          ? json.events.map((e) => `${new Date(e.created_at).toISOString().slice(5, 16).replace("T", " ")} [${e.kind}] ${e.project || e.query || ""} ${e.language ? "(" + e.language + ")" : ""}`).join("\n")
          : "台账为空。";
        return send(text, json);
      }
      case "stats": {
        const json = statsPayload();
        return send(statsText(json), json);
      }
      case "reindex": {
        const n = reindexAll((m) => logLine(m));
        return send(`重建索引完成: ${n} chunks`, { chunks: n });
      }
      default:
        return { kind: "error", text: `未知子命令: ${sub}。可用: status / search <q> / baseline [lang] / ledger [n] / stats / reindex(可加 --json)` };
    }
  } catch (e) {
    return { kind: "error", text: String(e?.message || e) };
  }
}

/* ------------------------------------------------------------------ */
/* tick(每日:钉版漂移检查 + 按需重建索引;只读,不 re-clone)             */
/* ------------------------------------------------------------------ */

function tick(log) {
  const d = getDb();
  let drift = [];
  for (const repo of REPOS) {
    const root = join(CORPUS, repo.name);
    if (!existsSync(join(root, ".git"))) continue;
    let head = "";
    try {
      head = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { timeout: 8000, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch { /* git 失败不阻塞 */ }
    if (!head) continue;
    d.prepare("UPDATE repos SET head=? WHERE name=?").run(head, repo.name);
    if (head !== repo.sha) {
      d.prepare("UPDATE repos SET index_state='stale' WHERE name=?").run(repo.name);
      drift.push(`${repo.name}@${head.slice(0, 8)}`);
    }
  }
  if (drift.length) {
    metaSet("last_drift", new Date().toISOString().slice(0, 10));
    log(`HEAD 漂移(钉版 ${drift.join(", ")});不自动 re-clone,由 agent 决定是否更新语料`);
  }
  ensureIndexed(log);
}

/* ------------------------------------------------------------------ */
/* plugin                                                              */
/* ------------------------------------------------------------------ */

const present = (title, text) => ({ card: "generic", title, content: [{ type: "text", text: String(text) }] });
const out = { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: String(value) }] };

export function apply(ctx) {
  const tools = ctx.get?.("tools") ?? ctx.tools;
  const commands = ctx.get?.("commands") ?? ctx.commands;
  const log = (m) => { try { ctx.logger?.warn?.("[ca-ref] " + m); } catch { /* ignore */ } };
  const disposers = [];

  // 启动 3s 后懒建索引(不阻塞 apply)
  setTimeout(() => {
    try { ensureIndexed((m) => log(m)); } catch (e) { log("index failed: " + e.message); }
  }, 3000);

  // 每日 tick
  try {
    disposers.push(ctx.interval(TICK_MS, () => {
      try { tick((m) => log(m)); } catch (e) { log("tick failed: " + e.message); }
    }));
  } catch { /* timer 不可用时跳过 */ }

  if (tools && typeof tools.register === "function") {
    tools.register({
      name: "ca_ref_search",
      description: "在 Clean Architecture 参考库(8 个钉版标准仓 + 基线文档)中全文搜索断言/文档/结构。审查 Clean Arch/DDD/六边形分层的项目时,先用它找参考断言,引用时带 <repo>:<path> 出处。中文按子串匹配,英文走 FTS5。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "检索词(中文/英文/符号均可)" },
          language: { type: "string", description: "可选:go|java|csharp|ts|python|generic", enum: ["go", "java", "csharp", "ts", "python", "generic"] },
          kind: { type: "string", description: "可选块类型:test=架构测试断言 / doc=文档 / rule=规则条目 / card=仓摘要卡 / structure=目录骨架 / config", enum: ["test", "doc", "rule", "card", "structure", "config"] },
          limit: { type: "number", description: "返回条数,默认 8,上限 25" },
        },
        required: ["query"],
      },
      output: out,
      async execute(args) {
        const results = search(args.query, { language: args.language, kind: args.kind, limit: args.limit });
        return searchText(results);
      },
      presentCall: (args) => present("CA 参考库:搜索", String(args?.query || "")),
    });

    tools.register({
      name: "ca_ref_baseline",
      description: "取 Clean Architecture 审查基线:指定语言的参考仓摘要卡 + 机器化规则清单(带断言模板与出处)+ 8 条红旗。开始审查一个项目前调用一次,拿到『标准答案集』。",
      parameters: {
        type: "object",
        properties: {
          language: { type: "string", description: "被测项目语言:go|java|csharp|ts|python(缺省返回全部 8 仓摘要 + generic 规则)", enum: ["go", "java", "csharp", "ts", "python"] },
        },
      },
      output: out,
      async execute(args) {
        return baselineText(baselinePayload(args?.language));
      },
      presentCall: (args) => present("CA 参考库:基线", args?.language || "generic"),
    });

    tools.register({
      name: "ca_ref_record",
      description: "审查完一个项目后自动留账:记录项目、语言、命中的规则(rule_id 来自 ca_ref_baseline 的规则清单)与证据。台账进观察窗面板,命中统计反哺参考库策展。",
      parameters: {
        type: "object",
        properties: {
          project: { type: "string", description: "被测项目名/路径" },
          language: { type: "string", description: "项目语言" },
          findings: {
            type: "array",
            description: "命中项列表",
            items: {
              type: "object",
              properties: {
                rule_id: { type: "string", description: "ca_ref_baseline 返回的规则 id(如 dep-model-app)" },
                severity: { type: "string", enum: ["red", "yellow", "ok"] },
                evidence: { type: "string", description: "证据:文件:行 + 一句说明" },
                source_ref: { type: "string", description: "参考出处 <repo>:<path>" },
              },
              required: ["rule_id", "severity"],
            },
          },
        },
        required: ["project"],
      },
      output: out,
      async execute(args) {
        const lid = recordReview(args || {});
        const n = Array.isArray(args?.findings) ? args.findings.length : 0;
        const red = (args?.findings || []).filter((f) => f.severity === "red").length;
        return `已留审查账 ${lid}:project=${args?.project},findings=${n}(red ${red})。面板「审查」tab 可见,命中统计已 +1。`;
      },
      presentCall: (args) => present("CA 参考库:留账", String(args?.project || "")),
    });

    tools.register({
      name: "ca_ref_status",
      description: "CA 参考库健康状态:8 仓钉版 SHA / 验证结果(绿=实测通过,灰=只读参考)/ 索引状态 / 台账量。排查『参考库是不是还新鲜』时用。",
      parameters: { type: "object", properties: {}, required: [] },
      output: out,
      async execute() {
        const j = statusPayload();
        return [
          `语料: ${j.corpus}`,
          `索引: ${j.index.chunks} chunks @ ${j.index.at ? new Date(j.index.at).toISOString().slice(0, 16).replace("T", " ") : "未建"}`,
          ...j.repos.map((r) => `${r.verified === "pass" ? "🟢" : "⚪"} ${r.name} [${r.lang}] @ ${String(r.sha).slice(0, 8)}${r.head_drift ? " ⚠️ HEAD 漂移(上游已动)" : ""}(${r.verified}${r.verified_at ? "," + r.verified_at : ""})${r.note ? " — " + r.note : ""}`),
        ].join("\n");
      },
      presentCall: () => present("CA 参考库:状态", "ca_ref_status"),
    });
  }

  if (commands && typeof commands.register === "function") {
    commands.register({
      name: "ca-ref",
      description: "Clean Architecture 参考库:观察窗面板数据通道(status/search/baseline/ledger/stats/reindex,--json 输出结构化)",
      recordInput: true,
      handler: (invocation) => runCmd(invocation),
    });
  }

  ctx.effect(() => () => {
    for (const f of disposers) { try { f(); } catch { /* ignore */ } }
  });
}
