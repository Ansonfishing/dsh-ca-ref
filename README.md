# dsh-ca-ref

Clean Architecture 参考库——DSH（DeepSeek Harness）插件。

![面板截图](screenshots/ca-ref-panel.png)

## 功能

审查 Clean Arch / DDD / 六边形分层项目时,先从「标准答案集」拿基线,再对照审查:

- **8 个钉版参考仓**:Go / Java / C# / TypeScript / Python 的 Clean Architecture 与 DDD 示例仓,钉在固定 commit(漂移检查只读,不自动 re-clone)。
- **FTS5 全文搜索**:在参考仓的断言 / 文档 / 结构里全文检索,中文按子串、英文走 FTS5;引用时带 `<repo>:<path>` 出处。
- **机器化规则清单**:每条规则带断言模板与出处,`ca_ref_baseline` 一次拿齐指定语言的「标准答案集」。
- **审查台账**:审查完一个项目 `ca_ref_record` 留账(项目、语言、命中规则、证据),命中统计反哺参考库策展。
- **观察窗面板**:会话区「CA 参考库」tab(只读,30s 自动刷新)——基线(仓列表 + 规则覆盖表 + card 全文)、搜索记录、审查留账、命中统计四个子 tab。
- **每日 tick**:`git rev-parse HEAD` 校验钉版漂移 + 按需重建索引(只读)。

## Agent 工具

| 工具 | 用途 |
|---|---|
| `ca_ref_search` | 参考库全文搜索断言/文档/结构 |
| `ca_ref_baseline` | 取指定语言的参考仓摘要卡 + 规则清单 + 8 条红旗 |
| `ca_ref_record` | 审查完留账(项目/语言/命中规则/证据) |
| `ca_ref_status` | 参考库健康:钉版 SHA、验证结果、索引状态、台账量 |

另有 `/ca-ref status|search|baseline|ledger|stats|reindex` 命令通道(支持 `--json`)供面板使用。

## 安装

```bash
pnpm add dsh-ca-ref
# 或本地开发
dsh web --patch ./cordis.patch.yml --port 3090
```

语料默认在 `~/AI/ca-ref`(可用环境变量 `CAREF_CORPUS` 指向别处),数据库在 `~/.dsh/caref/caref.db`(首次使用自动建索引)。语料克隆与验证命令见 `seed/repos.json` 各仓的 `verify_cmd` 字段。

## 开发

```bash
node scripts/smoke.mjs   # 冒烟: 8 仓钉版 + 工具链 + 索引(本地语料缺失会跳过对应项)
```

`test/harness/index.html` 是独立的浏览器渲染 harness(mock 数据,`?chrome=0` 隐藏 harness 顶栏),用于不依赖 dsh 环境验证面板渲染。

## 许可证

[MIT](LICENSE) © Ansonfishing
