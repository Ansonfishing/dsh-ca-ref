# dsh-ca-ref

**语言 / Language: [中文](README.md) | [English](README.en.md)**

Clean Architecture 参考库——DSH(DeepSeek Harness)插件。

![面板截图](screenshots/ca-ref-panel.png)

## 为什么

审查 Clean Arch / DDD / 六边形分层项目时,「标准答案」散落在各个参考仓的架构测试和文档里,每次审查都要重新翻。

这个插件把 8 个钉版参考仓(Go / Java / C# / Python)预先索引成本地 FTS5 库,审查前一键拿「标准答案集」,审查完留账,命中统计反哺参考库策展。

## 快速开始

**前提**:DSH(带 web)+ pnpm;Node ≥ 24(`node:sqlite` 为 Node 24 内置)。

```bash
cd ~/.dsh/profiles/web                      # 你的 DSH web profile 目录
pnpm add github:Ansonfishing/dsh-ca-ref
```

然后在 `package.json` 的 `dsh.profile.bundles` 数组里加上 `"dsh-ca-ref"`,重启 `dsh`。会话区出现「CA 参考库」tab。

首次使用自动建索引;语料默认在 `~/AI/ca-ref`(可用 `CAREF_CORPUS` 环境变量指向别处)。语料 = 8 个公开参考仓,克隆地址与验证命令见 `seed/repos.json` 各仓的 `verify_cmd` 字段——本机没有对应语料时,相关检查自动跳过(是数据缺失,不是代码 bug)。

## 功能

- **8 个钉版参考仓**——钉在固定 commit,每日 tick 用 `git rev-parse HEAD` 只读校验漂移,不自动 re-clone。
- **FTS5 全文搜索**——参考仓的断言 / 文档 / 结构;中文按子串、英文走 FTS5;引用带 `<repo>:<path>` 出处。
- **机器化规则清单**——每条规则带断言模板与出处,`ca_ref_baseline` 一次拿齐指定语言的「标准答案集」(含 8 条红旗)。
- **审查台账**——`ca_ref_record` 留账(项目、语言、命中规则、证据),命中统计反哺策展。
- **观察窗面板**——只读 tab,30s 自动刷新:基线(仓列表 + 规则覆盖表 + card 全文)、搜索记录、审查留账、命中统计。

## Agent 工具

| 工具 | 用途 |
|---|---|
| `ca_ref_search` | 参考库全文搜索断言/文档/结构 |
| `ca_ref_baseline` | 取指定语言的参考仓摘要卡 + 规则清单 + 8 条红旗 |
| `ca_ref_record` | 审查完留账(项目/语言/命中规则/证据) |
| `ca_ref_status` | 参考库健康:钉版 SHA、验证结果、索引状态、台账量 |

另有 `/ca-ref status\|search\|baseline\|ledger\|stats\|reindex` 命令通道(支持 `--json`)供面板使用。

## 不用装 DSH,先看看面板?

clone 本仓库,浏览器直接打开 `test/harness/index.html`——零依赖渲染 harness,`?chrome=0` 隐藏 harness 顶栏。

## 语料更新

每日 tick 用 `git rev-parse HEAD` 只读校验 `seed/repos.json` 的钉版 SHA:漂移时面板基线 tab 标 ⚠️,不自动 re-clone。决定更新时,在语料目录对相应仓执行:

```bash
git fetch --all && git checkout <新 sha>   # 或保持旧钉版不动
<该仓 verify_cmd>                           # 如 make test,确认构建通过
```

更新后执行 `/ca-ref reindex` 重建索引。某仓语料缺失时,相关搜索/索引自动跳过(数据缺失,不是代码 bug)。

## 开发

```bash
npm test                    # hermetic 契约测试(node --test,不依赖本地语料)
node scripts/smoke.mjs      # 冒烟: 8 仓钉版 + 工具链 + 索引(本地语料缺失会跳过对应项)
```

本地开发:clone 后在 profile 里用 `pnpm add link:../path/to/dsh-ca-ref`。客户端改动浏览器 F5 即可;Node 侧(`index.js` / `lib/*.js`)改动需重启 `dsh`。

## 许可证

[MIT](LICENSE) © Ansonfishing
