# 贡献指南

感谢关注！欢迎 PR。

## PR 要求

- **测试必须绿**：`node scripts/smoke.mjs`（冒烟测试；本地无参考语料时对应项自动跳过）。
- **小步 PR**：一个 PR 只解决一件事，附简要说明动机。
- **钉版纪律**：新增/更换参考仓必须钉死 commit（`seed/repos.json`），并在 `verify_cmd` 给出验证命令；不自动 re-clone，漂移由每日 tick 只读报告。
- **不提交个人语料与台账**：本地语料（默认 `~/AI/ca-ref`）、数据库（`~/.dsh/caref/caref.db`）、审查台账一律不入库；个人配置放 `~/.dsh/` 下或用 `CAREF_CORPUS` 指向别处。
- **不提交真实环境信息**：路径、API key、token、私有仓、个人项目名一律脱敏；测试夹具用 `Demo-*` 等虚构名。
- **commit 规范**：`type(scope): 简述`，type ∈ feat / fix / docs / test / chore。
- 客户端渲染改动可先用 `test/harness/index.html`（浏览器直接打开，mock 数据，`?chrome=0` 隐藏顶栏）验证。

## 本地开发

```bash
node scripts/smoke.mjs                     # 冒烟
dsh web --patch ./cordis.patch.yml --port 3090   # 开发预览
```

## 许可证

MIT（见 [LICENSE](LICENSE)）。
