# dsh-ca-ref 面板 redesign 方案

> 目标：把「Clean Arch 参考库」观察窗从**平铺 tab 仪表盘**升级为**左右分栏的 list→detail 浏览体验**，
> 视觉对齐 `dsh-model-manager`（白底 + 蓝强调 `#0969da`），信息密度与结构参考模型管理。
> 参考基准：`dsh-model-manager` 的 `.mm-root` 白底两Pane + diff 三色行 + 详情抽屉 + 三列参数表。

## 0. 完成记录（截至本轮）

| 阶段 | 状态 | 落点 / 证据 |
|---|---|---|
| P0 服务端补 card + rules | ✅ | `index.js`；`smoke.mjs` 断言「每仓 card 含「目录骨架」+ rules 每条含 id/severity/section/check」全 PASS |
| P1 基线 tab 白底两 Pane | ✅ | `lib/client.js`：左仓列表(按 lang 分组 + 搜索过滤) + 右详情(状态丸 + 漂移⚠️ + note + 规则覆盖表 rule_id|severity|section|check + card 抽屉) |

- 生效：client 侧改动 **F5**；服务端 `index.js` 改动须 **用户手动重启 dsh**（红线不自动重启）。
- `node --check lib/client.js` 通过；`node scripts/smoke.mjs` **23/23 ALL PASS**。
- P2（搜索/审查 tab 两 Pane）非本次 scope，待下次。

---

## 0. 现状 → 问题

| 现状 | 问题 |
|---|---|
| 暗色、mnemon 同款 `--ca-*` token | 与参考库「参考/规范」调性不符；模型管理是白底蓝，更像「查阅库」而非「监控窗」 |
| 单列平铺：卡片网格 + 裸表格 | "选一个把全貌看穿"很弱——基线卡片点展开只能看 note，看不到规则覆盖与漂移内容 |
| 数据只走 `status/ledger/stats` | 详情要展示的 card 正文 + 规则归属不在 `status` 里（在 `baseline` 命令里） |
| 搜索=裸历史表 / 审查=堆叠卡片 | 扫描时看不到命中内容，需反复点"展开" |

---

## 1. 从模型管理抄什么（可直接迁移）

| 模型管理的做法 | 迁移到 ca-ref |
|---|---|
| `grid-template-columns:320px 1fr` 左右两Pane | 每个 section 都改成左列表 + 右详情 |
| 左列分组 + 状态药丸 + 选中高亮 | 仓按 lang 分组，状态丸（实测通过/只读/上游已动） |
| **diff 三色行**（改=黄/增=绿/删=红） | 仓钉版 vs 上游漂移差异；（后续 tab 复用） |
| **三列参数表** `flag | 值 | 说明` | → `rule_id | 严重度 | 证据/出处` |
| 校验绿/黄/红提示行 | 仓验证状态 / 漂移预警 |
| 抽屉 drawer（健康检查发现） | 详情里展开 card 全文 / 验证细节 |
| 顶部 pill + flash + toast | 只读也用 flash 预警、空态提示 |

---

## 2. 配色（已定：白底蓝强调）

固定白底调色板（scope 在 `.caRef-root`，覆盖宿主暗色背景）：

```css
--ca-bg:#ffffff; --ca-page:#eef1f5; --ca-layer:#f6f8fa; --ca-layer2:#eef1f4;
--ca-line:#d0d7de; --ca-line-strong:#b6bec7;
--ca-text:#1f2328; --ca-muted:#57606a; --ca-faint:#8c959f;
--ca-accent:#0969da; --ca-success:#1a7f37; --ca-warn:#9a6700; --ca-danger:#cf222e;
--ca-hover:rgba(175,184,193,.22);
```

实现方式：只重定义 `.caRef-root` 顶部的 `--ca-*` token 块为固定白底值（原来指向 DSW 暗色变量），
其后所有 `var(--ca-*)` 引用自动转白——无需逐处改色。同时 `.caRef-root{ background:#ffffff; border:none; box-shadow:none }`。

---

## 3. 逐 tab 设计

### ① 基线 tab（本次主做）— 两 Pane
**左列（~300px）**：顶部搜索框（按 name/lang 过滤）+ 按 lang 分组的仓列表。
每行：状态圆点(绿=pass/灰=只读/ amber=已动)+ 仓名 + lang pill + indexed 状态。选中行高亮（白底 + 蓝左边条）。

**右详情**：
- 头部：仓名 + lang pill + 状态丸（实测通过 / 只读参考 / 上游已动）+ SHA（漂移时显示 ⚠️ 对比 HEAD）。
- 备注行（note 存在时，黄底高亮）。
- **规则覆盖表**：`rule_id | 严重度(彩点) | 章节 | check` 三列，抄模型管理参数表样式。
- **card 正文**：抽屉式展开区，轻量 markdown 渲染（`##`→分区标题、```围栏→等宽块、其余正文），等宽滚动。

### ② 搜索 tab（下一步）
左列：搜索历史（查询/语言/时间/命中数/命中仓，可搜可筛）。右详情：该条搜索的真实命中 + snippet，三列 `repo:path → symbol · kind/lang`。

### ③ 审查 tab（下一步）
左列：审查历史（project/语言/red 数/时间）。右详情：把"堆叠卡片"换成**三列规则表** `rule_id | 严重度圆点 | 证据 + 出处`，严重度高亮，取代"展开全部 6 条"。

### ④ 统计 tab（保持 + 微调）
大数字卡 + 条形图保留。可在左列补"仓命中/规则命中 Top 列表"，右列保留图表。

---

## 4. 数据（服务端：已定一次性补全）

`statusPayload()` 每个仓补充两个字段（纯加字段，不改语义，`~/.dsh/ca-ref/caref.db` 不动）：

- `card`：读 `cards/<repo>.md` 全文（存在则给，缺失则 null）。
- `rules`：按 `rules.yml` 的 `source.repo` 归因，该仓覆盖的规则 `{id, severity, section, check}` 数组。

客户端 30s 轮询增量约 20–30KB，可忽略。`clean-code-typescript` 等规则源若不在 6 仓内，归因时自然不出现在任何仓的规则表（ gracefully 丢弃）。

---

## 5. 分阶段与生效方式

| 阶段 | 内容 | 生效 |
|---|---|---|
| **P0（本次）** ✅ | 服务端 `statusPayload` 补 card + rules | **用户手动重启 dsh** |
| **P1（本次）** ✅ | client.js 基线 tab 改白底两 Pane（左仓列表 + 右详情） | F5 |
| P2（下次） | client.js 搜索/审查 tab 改两 Pane；统计 tab 微调 | F5 |
| P3（可选） | diff 三色行：钉版 vs 上游漂移 diff 展示 | F5 |

> 纪律：client.js 改动 F5 生效（client 半），服务端 `index.js` 改动须用户手动重启 dsh（红线：插件/agent 不自动重启）。

---

## 6. 验证
- 重启 dsh 后 F5，基线 tab 左侧 6 仓列表可按 name/lang 过滤，选中仓右侧展示状态丸 + 规则覆盖表 + card。
- `node --check lib/client.js` 无语法错；`node scripts/smoke.mjs`（如有）通过。
- 各 tab 在白底下视觉一致、无越界溢出（面板容器窄屏时两Pane 左列可滚）。

---

## 7. Python 基线补位记录(6 仓 → 8 仓)

用户确认「两个都收」:django-oscar + fastapi 入基线,补齐 Python 缺口(此前 0 规则 0 基线仓)。

### 钉版与验证(真跑)
- `django-oscar` @ cdbfc4412c87(last 2026-08-20,85M):纯单测子集 7 文件 16 测试 0 失败(venv `.venv-oscar`);DB fixture 测试(48)需 postgres,`--sqlite` 下失败属环境性;无 ArchUnit 式架构测试,价值=17 个 bounded-context app 结构 + flake8/isort lint 基线。
- `fastapi` @ 49033471594e(last 2026-08-26,59M):`pytest tests/test_router_circular_import.py -q` → 1 passed(venv `.venv-fastapi`,strict-config 需 pytest-timeout);框架级参考=DI 依赖方向(dependencies←routing/openapi)+ import 环守护测试模板;209 测试文件不跑全量。

### 插件改动(红绿纪律:smoke 先红后绿)
- `index.js`:新增 `chunkPythonTestFile`(按 `def `/`class ` 行切块);reindexAll 按 `.py` 分派切块器;TEST_SOURCES +fastapi guard 测试;baselineText 在指定语言时内嵌卡正文(此前工具描述承诺「摘要卡」但只输出仓列表);工具描述 6→8 仓;旧注「6 仓基线不覆盖 Python」替换为如实局限说明。
- `seed/repos.json`:8 仓(+2 python,含 verify_cmd/note)。
- `scripts/smoke.mjs`:+4 python 断言(test 切块 / oscar 结构命中 / baseline(python) 含卡+py 规则 / 旧注清除)+ repos 数 6→8。

### 语料侧(~/AI/ca-ref,非 git 仓)
- `rules.yml` v2:40 条规则(+§2.7 七条 py-,全部带 source)+ repos 段 8 仓。
- `AGENT-REVIEW-BASELINE.md`:§0/§1/§2.7/§3/§5 全量同步(含 Python 实测块)。
- `cards/{django-oscar,fastapi}.md` 新增;`MANIFEST.md` +2 行(基线⑦/⑧)。

### 生效方式
- 数据侧(规则/卡/索引/DB repos)已即时可用:生产索引独立进程重建(2750 chunks),实时工具 ca_ref_baseline(python)/ca_ref_search(python) 已验。
- **服务端 index.js 改动须用户手动重启 dsh web 生效**:工具描述 8 仓、python 切块、baseline 卡内嵌、新「如实说明」;运行进程内存 REPOS 仍是 6 仓(其 24h tick 在重启前若触发会用 6 仓重建索引——重启后立即触发 /ca-ref reindex 或等下次 tick 漂移检查即可恢复 8 仓,生产索引已重建,24h 内无此风险)。
