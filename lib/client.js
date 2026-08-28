/**
 * dsh-ca-ref client —「CA 参考库」观察窗面板
 *
 * 数据通道: /ca-ref status|ledger|stats --json 三条只读命令(30s 轮询 + 手动刷新)。
 * 设计语言对齐 dsh-mnemon 面板: --ca-* token 别名层、下划线 tab、3px 状态 rail 卡片、
 * pill 徽章、0.12s 微交互、focus-visible / reduced-motion / coarse pointer 适配。
 * 本文件改动仅 F5 生效(client 半),不碰服务端。
 */
window.__ModuleLoader__.load({
  id: "dsh-ca-ref",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let React = require("react");
    const e = React.createElement;

    /* ---------- 常量 ---------- */

    const TABS = [
      { id: "baseline", label: "基线" },
      { id: "search", label: "搜索" },
      { id: "review", label: "审查" },
      { id: "stats", label: "统计" },
    ];
    const REFRESH_MS = 30000;

    /* ---------- 样式(caRef- 前缀;token 全部走 DSW 主题变量,带兜底) ---------- */

    const CSS = `
.caRef-root{
  /* 白底蓝强调固定 token(覆盖宿主暗色背景,对齐 dsh-model-manager) */
  --ca-bg:#ffffff; --ca-page:#eef1f5; --ca-layer:#f6f8fa; --ca-layer2:#eef1f4;
  --ca-line:#d0d7de; --ca-line-strong:#b6bec7;
  --ca-text:#1f2328; --ca-muted:#57606a; --ca-faint:#8c959f;
  --ca-accent:#0969da; --ca-success:#1a7f37; --ca-warn:#9a6700; --ca-danger:#cf222e;
  --ca-hover:rgba(175,184,193,.22);
  --ca-font:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
  --ca-code:ui-monospace,SFMono-Regular,"JetBrains Mono",Consolas,monospace;
  display:flex;flex-direction:column;height:100%;min-height:0;
  padding:0;font-size:12.5px;line-height:1.5;color:var(--ca-text);
  font-family:var(--ca-font);background:#ffffff;
}
.caRef-root *{box-sizing:border-box;}
.caRef-root button,.caRef-root input,.caRef-root select,.caRef-root textarea{font-family:var(--ca-font);}
.caRef-root :focus-visible{outline:2px solid var(--ca-accent);outline-offset:2px;}

/* 页头(标题 + meta 行 + 刷新) */
.caRef-header{padding:14px 16px 0;flex:none;display:flex;flex-direction:column;gap:3px;}
.caRef-titleRow{display:flex;align-items:center;gap:10px;}
.caRef-title{font-size:14px;font-weight:600;line-height:1.4;}
.caRef-headerMeta{color:var(--ca-faint);font-size:11px;font-variant-numeric:tabular-nums;}

/* 按钮 */
.caRef-btn{
  min-height:32px;padding:5px 12px;border:1px solid var(--ca-line-strong);border-radius:8px;
  background:transparent;color:var(--ca-text);font-size:12px;cursor:pointer;white-space:nowrap;
  transition:background-color .12s,color .12s,border-color .12s,transform .12s;
}
.caRef-btn:hover:not(:disabled){background:var(--ca-hover);}
.caRef-btn:active:not(:disabled){transform:translateY(1px);}
.caRef-btn:disabled{opacity:.45;cursor:default;}
.caRef-titleRow .caRef-btn{margin-left:auto;}

/* 下划线 tab(与 DSH 壳子 tab 语言一致) */
.caRef-tabs{display:flex;gap:2px;border-bottom:1px solid var(--ca-line);margin:10px -16px 0;padding:0 16px;flex:none;overflow-x:auto;scrollbar-width:none;}
.caRef-tabs::-webkit-scrollbar{display:none;}
.caRef-tab{
  flex:none;border:0;background:none;border-bottom:2px solid transparent;margin-bottom:-1px;
  padding:7px 14px;font-size:13px;color:var(--ca-muted);cursor:pointer;
  transition:background-color .12s,color .12s;
}
.caRef-tab:hover{background:var(--ca-hover);}
.caRef-tab.is-active{border-bottom-color:var(--ca-accent);color:var(--ca-text);font-weight:600;}

/* 内容区 */
.caRef-body{flex:1;min-height:0;overflow-y:auto;padding:14px 16px clamp(48px,8vh,96px);}
.caRef-fade{animation:caRefFade .15s ease-out;}
@keyframes caRefFade{from{opacity:.55}to{opacity:1}}

/* 错误条 */
.caRef-error{
  border:1px solid var(--ca-line-strong);border-color:color-mix(in srgb,var(--ca-danger) 34%,var(--ca-line));
  background:var(--ca-layer);background:color-mix(in srgb,var(--ca-danger) 6%,var(--ca-layer));
  border-radius:8px;padding:8px 12px;font-size:12px;color:var(--ca-danger);margin-bottom:12px;
}

/* 分区 */
.caRef-section{margin-bottom:16px;}
.caRef-kicker{font-size:11px;font-weight:600;letter-spacing:.06em;color:var(--ca-muted);margin:0 0 8px;}
.caRef-indexLine{font-size:12px;color:var(--ca-muted);word-break:break-all;font-variant-numeric:tabular-nums;}

/* 徽章(pill) */
.caRef-badge{
  display:inline-flex;align-items:center;min-height:22px;padding:0 8px;
  border:1px solid var(--ca-line);border-radius:999px;background:var(--ca-bg);
  color:var(--ca-muted);font-size:11px;line-height:20px;white-space:nowrap;
}
.caRef-badge--success{border-color:color-mix(in srgb,var(--ca-success) 34%,var(--ca-line));color:var(--ca-success);background:color-mix(in srgb,var(--ca-success) 7%,var(--ca-bg));font-weight:500;}
.caRef-badge--warn{border-color:color-mix(in srgb,var(--ca-warn) 34%,var(--ca-line));color:var(--ca-warn);background:color-mix(in srgb,var(--ca-warn) 7%,var(--ca-bg));font-weight:500;}
.caRef-badge--danger{border-color:color-mix(in srgb,var(--ca-danger) 34%,var(--ca-line));color:var(--ca-danger);background:color-mix(in srgb,var(--ca-danger) 7%,var(--ca-bg));font-weight:500;}
.caRef-badge--accent{border-color:color-mix(in srgb,var(--ca-accent) 30%,var(--ca-line));color:var(--ca-accent);background:color-mix(in srgb,var(--ca-accent) 7%,var(--ca-bg));font-weight:500;}

/* 基线:两 Pane 已替代旧的参考仓卡片网格(caRef-repoGrid/repoCard 已移除) */

/* 表格(搜索记录) */
.caRef-table{width:100%;border-collapse:collapse;font-size:12.5px;}
.caRef-table th{
  text-align:left;padding:6px 8px;font-size:11px;font-weight:500;letter-spacing:.04em;
  color:var(--ca-faint);border-bottom:1px solid var(--ca-line);white-space:nowrap;
}
.caRef-table td{padding:6px 8px;border-bottom:1px solid var(--ca-line);vertical-align:top;word-break:break-all;}
.caRef-table tr:last-child td{border-bottom:0;}
.caRef-table .caRef-nowrap{white-space:nowrap;font-variant-numeric:tabular-nums;}

/* 审查留账卡片 */
.caRef-reviewCard{border:1px solid var(--ca-line);border-radius:8px;background:var(--ca-layer);padding:10px 12px;margin-bottom:10px;}
.caRef-reviewHead{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;}
.caRef-reviewName{font-size:13px;font-weight:600;}
.caRef-reviewTime{margin-left:auto;font-size:11px;color:var(--ca-faint);font-variant-numeric:tabular-nums;}
.caRef-findings{margin-top:8px;display:flex;flex-direction:column;gap:4px;}
.caRef-finding{display:flex;align-items:baseline;gap:8px;font-size:12.5px;}
.caRef-dot{width:8px;height:8px;border-radius:50%;flex:none;position:relative;top:1px;}
.caRef-dot--red{background:var(--ca-danger);}
.caRef-dot--yellow{background:var(--ca-warn);}
.caRef-dot--ok{background:var(--ca-faint);}
.caRef-findingRule{font-family:var(--ca-code);font-size:12px;color:var(--ca-text);white-space:nowrap;}
.caRef-findingEv{font-size:12px;color:var(--ca-muted);word-break:break-all;}
.caRef-expand{
  margin-top:6px;background:none;border:0;padding:2px 0;
  color:var(--ca-accent);font-size:12px;cursor:pointer;
}
.caRef-expand:hover{text-decoration:underline;}

/* 统计:大数字卡 + 条形图 + 折叠 */
.caRef-statGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:12px;margin-bottom:16px;}
.caRef-statCard{border:1px solid var(--ca-line);border-radius:8px;background:var(--ca-layer);padding:12px 14px;}
.caRef-statValue{font-size:20px;font-weight:600;line-height:1.2;font-variant-numeric:tabular-nums;}
.caRef-statLabel{margin-top:4px;font-size:11px;letter-spacing:.06em;color:var(--ca-faint);}
.caRef-barRow{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
.caRef-barLabel{width:200px;flex:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--ca-muted);}
.caRef-barTrack{flex:1;height:6px;border-radius:3px;background:var(--ca-line);overflow:hidden;}
.caRef-barFill{height:100%;border-radius:3px;background:var(--ca-accent);}
.caRef-barNum{width:26px;text-align:right;font-size:12px;color:var(--ca-muted);font-variant-numeric:tabular-nums;}
.caRef-details{border:1px solid var(--ca-line);border-radius:8px;background:var(--ca-layer);overflow:hidden;}
.caRef-details>summary{
  display:flex;align-items:center;gap:6px;padding:8px 12px;
  font-size:12px;color:var(--ca-muted);cursor:pointer;list-style:none;
}
.caRef-details>summary::-webkit-details-marker{display:none;}
.caRef-details>summary:before{content:"▸";font-size:10px;color:var(--ca-faint);transition:transform .12s;}
.caRef-details[open]>summary:before{transform:rotate(90deg);}
.caRef-detailsBody{padding:0 12px 10px;font-size:12px;line-height:1.7;color:var(--ca-muted);word-break:break-all;}

/* 空态(引导式) */
.caRef-empty{padding:48px 16px;text-align:center;}
.caRef-emptyTitle{font-size:13px;font-weight:500;color:var(--ca-muted);margin-bottom:6px;}
.caRef-emptyHint{font-size:12px;line-height:1.7;color:var(--ca-faint);max-width:44ch;margin:0 auto;}
.caRef-emptySmall{padding:8px 0;font-size:12px;color:var(--ca-faint);}

/* 两Pane: 左仓列表 + 右详情 */
.caRef-panes{display:grid;grid-template-columns:290px 1fr;flex:1;min-height:0;gap:0;}
.caRef-paneL{border-right:1px solid var(--ca-line);padding:8px;overflow:auto;background:var(--ca-page);}
.caRef-paneR{padding:12px 16px 16px;overflow:auto;}
.caRef-listSearch{width:100%;min-height:26px;padding:3px 8px;border:1px solid var(--ca-line);border-radius:8px;background:var(--ca-bg);color:var(--ca-text);font-size:12px;margin-bottom:8px;box-sizing:border-box;}
.caRef-listSearch:focus{outline:none;border-color:color-mix(in srgb,var(--ca-accent) 55%,var(--ca-line));box-shadow:0 0 0 2px color-mix(in srgb,var(--ca-accent) 14%,transparent);}
.caRef-groupKicker{font-size:11px;font-weight:600;letter-spacing:.06em;color:var(--ca-muted);padding:5px 6px 3px;}
.caRef-repoItem{display:flex;align-items:center;gap:7px;padding:6px 8px;border-radius:7px;cursor:pointer;min-width:0;border:1px solid transparent;background:transparent;}
.caRef-repoItem:hover{background:var(--ca-hover);}
.caRef-repoItem.is-active{background:var(--ca-bg);border-color:var(--ca-line);box-shadow:inset 3px 0 0 var(--ca-accent);}
.caRef-itemDot{width:7px;height:7px;border-radius:50%;flex:none;}
.caRef-itemName{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--ca-text);}
.caRef-itemPill{font-family:var(--ca-code);font-size:10px;border:1px solid var(--ca-line);border-radius:4px;padding:0 4px;line-height:16px;color:var(--ca-muted);flex:none;}
.caRef-itemDrift{font-size:9.5px;color:var(--ca-warn);border:1px solid color-mix(in srgb,var(--ca-warn) 40%,var(--ca-line));border-radius:999px;padding:0 5px;line-height:15px;flex:none;white-space:nowrap;}
.caRef-itemCount{font-size:10px;color:var(--ca-faint);flex:none;}

/* 右详情头 */
.caRef-detailMeta{color:var(--ca-faint);font-size:11px;font-variant-numeric:tabular-nums;}
.caRef-detailMeta code{font-family:var(--ca-code);font-size:11px;color:var(--ca-muted);background:var(--ca-bg);border:1px solid var(--ca-line);border-radius:4px;padding:1px 5px;}
.caRef-noteWarn{border:1px solid color-mix(in srgb,var(--ca-warn) 40%,var(--ca-line));background:color-mix(in srgb,var(--ca-warn) 7%,var(--ca-bg));border-radius:8px;padding:8px 12px;font-size:12px;color:var(--ca-warn);margin:10px 0;}
.caRef-ruleSectionTitle{font-size:11px;font-weight:600;letter-spacing:.06em;color:var(--ca-muted);margin:16px 0 6px;}
.caRef-ruleTable{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:6px;}
.caRef-ruleTable th{text-align:left;padding:5px 8px;font-size:10px;font-weight:600;letter-spacing:.04em;color:var(--ca-faint);border-bottom:1px solid var(--ca-line);white-space:nowrap;}
.caRef-ruleTable td{padding:5px 8px;border-bottom:1px solid color-mix(in srgb,var(--ca-line) 55%,transparent);vertical-align:top;}
.caRef-ruleId{font-family:var(--ca-code);font-size:11px;color:var(--ca-text);white-space:nowrap;}
.caRef-sevDot{width:8px;height:8px;border-radius:50%;flex:none;}
.caRef-ruleCheck{color:var(--ca-muted);font-size:11.5px;}

/* 详情抽屉(card) */
.caRef-drawer{border:1px solid var(--ca-line);border-radius:8px;background:var(--ca-layer);overflow:hidden;margin-top:12px;}
.caRef-drawerHead{display:flex;align-items:center;gap:6px;padding:8px 12px;font-size:12px;font-weight:600;cursor:pointer;color:var(--ca-muted);}
.caRef-drawerHead:before{content:"▸";font-size:10px;color:var(--ca-faint);transition:transform .12s;}
.caRef-drawerHead.open:before{transform:rotate(90deg);}
.caRef-drawerBody{padding:10px 14px;font-size:12px;line-height:1.6;color:var(--ca-text);word-break:break-word;}
.caRef-drawerBody h2{font-size:13px;font-weight:600;margin:12px 0 4px;}
.caRef-drawerBody h3,.caRef-drawerBody h4{font-size:12px;font-weight:600;margin:8px 0 3px;}
.caRef-drawerBody pre{font-family:var(--ca-code);font-size:11px;background:var(--ca-bg);border:1px solid var(--ca-line);border-radius:6px;padding:8px 10px;overflow:auto;margin:6px 0;white-space:pre-wrap;word-break:break-all;}
.caRef-drawerBody code{font-family:var(--ca-code);font-size:11px;background:var(--ca-bg);border:1px solid var(--ca-line);border-radius:4px;padding:0 5px;}
.caRef-drawerBody p{margin:6px 0;}
.caRef-drawerBody a{color:var(--ca-accent);}

@media (pointer:coarse){
  .caRef-btn{min-height:40px;}
  .caRef-tab{padding:9px 14px;}
  .caRef-expand{min-height:32px;}
}
@media (prefers-reduced-motion:reduce){
  .caRef-root *,.caRef-root *::before,.caRef-root *::after{transition:none!important;animation:none!important;}
}
`;

    /* ---------- 工具 ---------- */

    function fmtTime(ts) {
      return ts ? new Date(ts).toISOString().slice(5, 16).replace("T", " ") : "—";
    }
    function fmtLocal(ts) {
      try { return new Date(ts).toLocaleTimeString("zh-CN", { hour12: false }); } catch { return ""; }
    }
    function fmtRel(ts) {
      if (!ts) return "—";
      const diff = Date.now() - ts;
      if (diff < 60e3) return "刚刚";
      if (diff < 3600e3) return Math.floor(diff / 60e3) + " 分钟前";
      if (diff < 86400e3) return Math.floor(diff / 3600e3) + " 小时前";
      return fmtTime(ts);
    }
    function shortSha(sha) { return sha ? String(sha).slice(0, 10) : "—"; }

    function currentSessionIdFallback(sessionsList) {
      try {
        const snap = sessionsList && sessionsList.getSnapshot ? sessionsList.getSnapshot() : null;
        if (!snap) return undefined;
        if (snap.current) return snap.current;
        const ids = Object.keys(snap.byId || {});
        return ids.length ? ids[ids.length - 1] : undefined;
      } catch {
        return undefined;
      }
    }

    /* ---------- 小组件 ---------- */

    function Badge({ tone, children, title }) {
      return e("span", {
        className: "caRef-badge" + (tone ? " caRef-badge--" + tone : ""),
        title: title || undefined,
      }, children);
    }

    function StatCard({ value, label }) {
      return e("div", { className: "caRef-statCard" },
        e("div", { className: "caRef-statValue" }, value),
        e("div", { className: "caRef-statLabel" }, label));
    }

    function BarList(data, emptyText) {
      const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
      if (!entries.length) return e("div", { className: "caRef-emptySmall" }, emptyText);
      const max = entries[0][1];
      return e("div", null, entries.map(([k, v]) => e("div", { key: k, className: "caRef-barRow" },
        e("span", { className: "caRef-barLabel", title: k }, k),
        e("div", { className: "caRef-barTrack" }, e("div", { className: "caRef-barFill", style: { width: (v / max) * 100 + "%" } })),
        e("span", { className: "caRef-barNum" }, String(v))
      )));
    }

    function EmptyState({ title, hint }) {
      return e("div", { className: "caRef-empty" },
        e("div", { className: "caRef-emptyTitle" }, title),
        hint ? e("div", { className: "caRef-emptyHint" }, hint) : null);
    }

    function sevDot(sev) {
      const c = sev === "red" ? "var(--ca-danger)" : sev === "ok" ? "var(--ca-faint)" : "var(--ca-warn)";
      return e("span", { className: "caRef-sevDot", style: { background: c } });
    }

    /* 左列仓库项(选中高亮蓝左边条 + 状态圆点) */
    function RepoListItem({ r, active, onClick }) {
      const dotColor = r.head_drift ? "var(--ca-warn)" : r.verified === "pass" ? "var(--ca-success)" : "var(--ca-faint)";
      return e("div", {
        className: "caRef-repoItem" + (active ? " is-active" : ""),
        onClick: onClick,
        role: "button",
        tabIndex: 0,
        onKeyDown: (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onClick(); } },
        "aria-label": r.name + (active ? "（已选中）" : ""),
      },
        e("span", { className: "caRef-itemDot", style: { background: dotColor } }),
        e("span", { className: "caRef-itemName" }, r.name),
        e("span", { className: "caRef-itemPill" }, r.lang),
        r.head_drift && e("span", { className: "caRef-itemDrift" }, "上游已动"),
        e("span", { className: "caRef-itemCount" }, (r.rules || []).length + " 规则")
      );
    }

    /* 轻量 markdown(仅 ## / ``` 围栏 / - 列表 / 正文),不引入引擎 */
    function renderCard(body) {
      if (!body) return e("div", { className: "caRef-emptySmall" }, "暂无 card 正文");
      const lines = String(body).split("\n");
      const out = [];
      let inCode = false, buf = [];
      let k = 0;
      const flush = () => { if (buf.length) { out.push(e("pre", { key: "c" + (k++) }, buf.join("\n"))); buf = []; } };
      for (const line of lines) {
        if (line.startsWith("```")) { if (inCode) { flush(); inCode = false; } else { flush(); inCode = true; buf = []; } continue; }
        if (line.startsWith("## ")) { flush(); out.push(e("h2", { key: "h" + (k++) }, line.slice(3))); continue; }
        if (line.startsWith("### ") || line.startsWith("# ")) { flush(); out.push(e("h4", { key: "h" + (k++) }, line.replace(/^#+ /, ""))); continue; }
        if (line.startsWith("- ")) { flush(); out.push(e("p", { key: "p" + (k++) }, line.slice(2))); continue; }
        if (!line.trim()) continue;
        buf.push(line.replace(/\n/g, " ").slice(0, 220));
      }
      flush();
      return out.length ? out : e("p", null, String(body).slice(0, 220));
    }

    /* ---------- 面板组件(只读观察窗,数据全走 /ca-ref --json) ---------- */

    function CaRefPanel(ctx, props) {
      const [tab, setTab] = React.useState("baseline");
      const [status, setStatus] = React.useState(null);
      const [ledger, setLedger] = React.useState(null);
      const [stats, setStats] = React.useState(null);
      const [error, setError] = React.useState("");
      const [loading, setLoading] = React.useState(true);
      const [refreshing, setRefreshing] = React.useState(false);
      const [pulse, setPulse] = React.useState(0);
      const [updatedAt, setUpdatedAt] = React.useState(null);
      const [expandedRepo, setExpandedRepo] = React.useState(null);
      const [expandedReview, setExpandedReview] = React.useState(null);
      const [selectedRepo, setSelectedRepo] = React.useState(null);
      const [listFilter, setListFilter] = React.useState("");
      const [expandedCard, setExpandedCard] = React.useState(false);

      let sid = props.sessionId;
      if (typeof sid !== "string" || !sid) sid = currentSessionIdFallback(ctx.sessions && ctx.sessions.list);
      const errs = React.useRef([]);

      const load = React.useCallback(async () => {
        if (!sid) {
          setError("观察窗需要在会话内运行(取不到当前会话)");
          setLoading(false);
          return;
        }
        const remoteOk = ctx.remote && ctx.remote.commands && typeof ctx.remote.commands.execute === "function";
        if (!remoteOk) {
          setError("remote 通道未注入(客户端缺少 remote.commands 服务)");
          setLoading(false);
          return;
        }
        errs.current = [];
        setRefreshing(true);
        const exec = (line, slot) =>
          Promise.resolve()
            .then(() => ctx.remote.commands.execute(sid, line, []))
            .then(
              (result) => okResult(result, slot, (m) => errs.current.push(m)),
              (e2) => {
                errs.current.push(slot + " 被拒绝: " + (e2 && (e2.message || e2.code) || String(e2)));
                return null;
              }
            );
        // 命令并发发出，但 status 先到先渲染：不把面板锁在「加载中」等慢命令(ledger/stats)
        const pStatus = exec("/ca-ref status --json", "status");
        const pLedgerStats = Promise.all([
          exec("/ca-ref ledger 40 --json", "ledger"),
          exec("/ca-ref stats --json", "stats"),
        ]);
        const s = await pStatus;
        if (s) setStatus(s);
        if (s) {
          setUpdatedAt(Date.now());
          setError("");
          setPulse((p) => p + 1);
          setLoading(false);
          setRefreshing(false);
        }
        // ledger/stats 异步补齐——此时面板已显示，迟到了再更新搜索/审查/统计
        const [l, t] = await pLedgerStats;
        if (l) setLedger(l);
        if (t) setStats(t);
        if (!s) {
          setError(errs.current.join(" | ") || "远程通道不可用(原因未知,刷新后重试)");
          setLoading(false);
          setRefreshing(false);
        }
      }, [sid]);

      React.useEffect(() => {
        load();
        const iv = setInterval(load, REFRESH_MS);
        return () => clearInterval(iv);
      }, [load]);

      const searchEvents = (ledger?.events || []).filter((ev) => ev.kind === "search");
      const reviewEvents = (ledger?.events || []).filter((ev) => ev.kind === "review");
      const totals = (stats && stats.totals) || {};
      const totalRecords = (totals.search || 0) + (totals.review || 0);

      const meta = ["只读观察窗", REFRESH_MS / 1000 + "s 自动刷新"];
      if (tab === "baseline" && status)
        meta.push("左选仓 · 右详情(点「查看 card 全文」展开说明)");
      if (status) meta.push(status.repos.length + " 仓 · " + status.index.chunks + " chunks");
      if (stats) meta.push("台账 " + totalRecords + " 条");
      if (updatedAt && !refreshing) meta.push("更新 " + fmtLocal(updatedAt));

      /* ---- 基线 tab(两Pane: 左仓列表 + 右详情) ---- */
      const renderBaseline = () => {
        if (!status) return e("div", { className: "caRef-emptySmall" }, "基线状态加载中…");
        const repos = (status.repos || []).slice().sort((a, b) => a.name.localeCompare(b.name));
        const lf = (listFilter || "").toLowerCase();
        const list = repos.filter((r) =>
          !lf || r.name.toLowerCase().includes(lf) || r.lang.toLowerCase().includes(lf)
        );
        const groups = [];
        const seen = {};
        for (const r of list) { if (!seen[r.lang]) { seen[r.lang] = true; groups.push(r.lang); } }
        const sel = repos.find((r) => r.name === selectedRepo) || repos[0];
        if (!repos.length) return e("div", { className: "caRef-emptySmall" }, "暂无参考仓");
        if (!sel) return e("div", { className: "caRef-emptySmall" }, "请从左侧选择一个参考仓");
        return e("div", { className: "caRef-panes" },
          e("div", { className: "caRef-paneL" },
            e("input", {
              className: "caRef-listSearch",
              type: "text",
              placeholder: "筛选仓名 / 语言 …",
              value: listFilter,
              onInput: (ev) => setListFilter(ev.target.value),
            }),
            groups.map((lang) => e("div", { key: lang },
              e("div", { className: "caRef-groupKicker" }, lang + " · " + list.filter((r) => r.lang === lang).length + " 仓"),
              list.filter((r) => r.lang === lang).map((r) =>
                e(RepoListItem, { key: r.name, r, active: sel.name === r.name, onClick: () => setSelectedRepo(r.name) })
              )
            ))
          ),
          e("div", { className: "caRef-paneR" },
            e("div", { className: "caRef-detailMeta" },
              e("span", null, "参考仓 · "),
              e("code", null, shortSha(sel.sha))
            ),
            e("div", { className: "caRef-titleRow", style: { marginTop: 6 } },
              e("span", { className: "caRef-detailName" }, sel.name),
              e("span", { className: "caRef-itemPill" }, sel.lang),
              sel.head_drift && e("span", { className: "caRef-itemDrift" }, "⚠️ 上游已动"),
              e("span", { className: "caRef-itemPill", style: { marginLeft: "auto" } }, sel.verified === "pass" ? "实测通过" : "只读参考")
            ),
            sel.note && e("div", { className: "caRef-noteWarn" }, sel.note),
            sel.rules && sel.rules.length
              ? e("div", null,
                e("div", { className: "caRef-ruleSectionTitle" }, "规则覆盖 · " + sel.rules.length + " 条"),
                e("table", { className: "caRef-ruleTable" },
                  e("thead", null, e("tr", null, ["规则", "严重度", "章节", "断言"].map((h) => e("th", { key: h }, h)))),
                  e("tbody", null, sel.rules.map((r) => e("tr", { key: r.id },
                    e("td", { className: "caRef-ruleId" }, r.id),
                    e("td", null, e("span", { style: { display: "flex", alignItems: "center", gap: "6px" } }, sevDot(r.severity), r.severity)),
                    e("td", null, r.section || "—"),
                    e("td", { className: "caRef-ruleCheck" }, r.check)
                  )))
                )
              )
              : e("div", { className: "caRef-emptySmall" }, "该仓暂无归因规则"),
            e("div", { className: "caRef-drawer" },
              e("div", {
                className: "caRef-drawerHead" + (expandedCard ? " open" : ""),
                role: "button",
                tabIndex: 0,
                onClick: () => setExpandedCard(!expandedCard),
                onKeyDown: (ev) => { if (ev.key === "Enter" || ev.key === " ") ev.preventDefault(), setExpandedCard(!expandedCard); },
              }, e("span", null, expandedCard ? "收起 card 全文" : "查看 card 全文")),
              expandedCard && e("div", { className: "caRef-drawerBody" }, renderCard(sel.card))
            )
          )
        );
      };

      /* ---- 搜索 tab ---- */
      const renderSearch = () => {
        if (!searchEvents.length) {
          return e(EmptyState, {
            title: "暂无搜索记录",
            hint: "AI 审查 Clean Arch / DDD / 六边形分层项目时调用 ca_ref_search,每次查询会自动留痕到这里。",
          });
        }
        return e("div", { className: "caRef-section" },
          e("div", { className: "caRef-kicker" }, "搜索记录 · 最近 " + searchEvents.length + " 条"),
          e("table", { className: "caRef-table" },
            e("thead", null, e("tr", null,
              ["时间", "查询", "语言", "命中仓"].map((h) => e("th", { key: h }, h))
            )),
            e("tbody", null, searchEvents.map((ev) => {
              const detail = safeParse(ev.detail);
              return e("tr", { key: ev.id },
                e("td", { className: "caRef-nowrap" }, e("span", { title: fmtTime(ev.created_at) }, fmtRel(ev.created_at))),
                e("td", null, ev.query || "—"),
                e("td", { className: "caRef-nowrap" }, ev.language || "—"),
                e("td", null, ((detail && detail.repos) || []).join(", ") || "0 命中")
              );
            }))
          )
        );
      };

      /* ---- 审查 tab ---- */
      const renderReview = () => {
        if (!reviewEvents.length) {
          return e(EmptyState, {
            title: "暂无审查记录",
            hint: "AI 审完一个项目调用 ca_ref_record 留账:项目、语言、命中的规则与证据都会记录到这里,命中统计随之累计。",
          });
        }
        return e("div", null, reviewEvents.map((ev) => {
          const findings = ev.findings || [];
          const red = findings.filter((f) => f.severity === "red").length;
          const expanded = expandedReview === ev.id;
          const shown = expanded ? findings : findings.slice(0, 6);
          return e("div", { key: ev.id, className: "caRef-reviewCard" },
            e("div", { className: "caRef-reviewHead" },
              e("span", { className: "caRef-reviewName" }, ev.project || "—"),
              ev.language ? e(Badge, null, ev.language) : null,
              e(Badge, { tone: red ? "danger" : "neutral" }, findings.length + " 项" + (red ? " · red " + red : "")),
              e("span", { className: "caRef-reviewTime", title: fmtTime(ev.created_at) }, fmtRel(ev.created_at))
            ),
            findings.length ? e("div", { className: "caRef-findings" },
              shown.map((f, i) => e("div", { key: i, className: "caRef-finding" },
                e("span", { className: "caRef-dot caRef-dot--" + (f.severity === "red" ? "red" : f.severity === "ok" ? "ok" : "yellow") }),
                e("span", { className: "caRef-findingRule" }, f.rule_id),
                f.evidence ? e("span", { className: "caRef-findingEv" }, f.evidence) : null
              ))
            ) : null,
            findings.length > 6 ? e("button", {
              type: "button",
              className: "caRef-expand",
              onClick: () => setExpandedReview(expanded ? null : ev.id),
            }, expanded ? "收起" : "展开全部 " + findings.length + " 条") : null
          );
        }));
      };

      /* ---- 统计 tab ---- */
      const renderStats = () => {
        if (!stats) return e(EmptyState, { title: "统计加载中…" });
        return e("div", null,
          e("div", { className: "caRef-statGrid" },
            e(StatCard, { value: totals.search !== undefined ? totals.search : "—", label: "搜索记录" }),
            e(StatCard, { value: totals.review !== undefined ? totals.review : "—", label: "审查留账" }),
            e(StatCard, { value: totalRecords, label: "台账总量" })
          ),
          e("div", { className: "caRef-section" },
            e("div", { className: "caRef-kicker" }, "参考仓命中"),
            BarList(stats.repoHits || {}, "暂无命中 — 搜索/审查后开始积累")
          ),
          e("div", { className: "caRef-section" },
            e("div", { className: "caRef-kicker" }, "规则命中 Top 12"),
            BarList(topN(stats.ruleHits || {}, 12), "暂无命中 — 审查留账后开始积累")
          ),
          e("div", { className: "caRef-section" },
            e("details", { className: "caRef-details" },
              e("summary", null, (stats.zeroHitRules || []).length + " 条规则尚无命中"),
              e("div", { className: "caRef-detailsBody" }, (stats.zeroHitRules || []).join(", ") || "(全部命中过)")
            )
          )
        );
      };

      return e("div", { className: "caRef-root" },
        e("style", null, CSS),
        e("div", { className: "caRef-header" },
          e("div", { className: "caRef-titleRow" },
            e("span", { className: "caRef-title" }, "Clean Arch 参考库"),
            e("button", {
              type: "button",
              className: "caRef-btn",
              disabled: refreshing || (loading && !status),
              onClick: load,
              title: "立即同步(每 " + REFRESH_MS / 1000 + "s 自动刷新一次)",
            }, refreshing ? "同步中…" : "刷新")
          ),
          e("div", { className: "caRef-headerMeta" }, meta.join(" · "))
        ),
        e("div", { className: "caRef-tabs", role: "tablist" },
          TABS.map((t) => e("button", {
            key: t.id,
            type: "button",
            role: "tab",
            "aria-selected": tab === t.id,
            className: "caRef-tab" + (tab === t.id ? " is-active" : ""),
            onClick: () => setTab(t.id),
          }, t.label))
        ),
        e("div", { className: "caRef-body" },
          e("div", { className: "caRef-fade", key: pulse },
            error ? e("div", { className: "caRef-error", role: "alert" }, error) : null,
            loading && !status ? e(EmptyState, { title: "加载中…" }) : null,
            tab === "baseline" ? renderBaseline() : null,
            tab === "search" ? renderSearch() : null,
            tab === "review" ? renderReview() : null,
            tab === "stats" ? renderStats() : null
          )
        )
      );
    }

    /* 兼容三种形状:友好包装 {ok,value,error} / 裸 {commandId,result:{kind,text}} / 直接字符串。
       失败时通过 report(slot+原因) 上报,面板直接显示,便于自诊断。 */
    function okResult(result, slot, report) {
      try {
        if (!result) { report(slot + ": 空结果"); return null; }
        if (result.ok === false) {
          const er = result.error || {};
          report(slot + ": " + (er.message || er.code || "调用失败"));
          return null;
        }
        let raw = result.ok === true ? result.value : result;
        if (raw === void 0 || raw === null) { report(slot + ": 命令未匹配(服务端未注册?)"); return null; }
        if (typeof raw === "string") {
          try { return JSON.parse(raw); } catch { report(slot + ": 返回非 JSON: " + raw.slice(0, 80)); return null; }
        }
        if (typeof raw === "object") {
          if ("result" in raw) {
            const r = raw.result;
            if (!r) { report(slot + ": 无结果体"); return null; }
            if (r.kind === "error") { report(slot + ": " + r.text); return null; }
            if (typeof r.text !== "string") return null;
            try { return JSON.parse(r.text); } catch { report(slot + ": 返回非 JSON: " + r.text.slice(0, 80)); return null; }
          }
          return raw;
        }
        report(slot + ": 未知形状 " + String(raw).slice(0, 60));
        return null;
      } catch (e2) {
        report(slot + " 解析异常: " + (e2 && e2.message || String(e2)));
        return null;
      }
    }

    function safeParse(s) {
      try { return JSON.parse(s); } catch { return null; }
    }

    function topN(obj, n) {
      return Object.fromEntries(Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n));
    }

    /* ---------- 插件主体 ---------- */

    const inject = ["slots", "remote", "remote.commands", "sessions"];

    function apply(ctx) {
      ctx.slots.inject("conversation.view", () => ctx.slots.register({
        name: "conversation.view",
        id: "ca-ref",
        order: 30,
        label: "CA 参考库",
        inject: (sessionId) => ({ sessionId }),
      }, (props) => CaRefPanel(ctx, props)));
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
