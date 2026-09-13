# simple-unified-application-portal-web

统一应用门户宿主，负责已授权应用入口、主题、站内信入口和 qiankun 微前端挂载；不承载 IAM、KMS、CRM 等业务页面源码。

用户下拉菜单提供修改密码入口：整页跳转登录侧改密页并携带当前位置，改密完成后回跳原页面。跳转登录侧的地址统一拼接 `VITE_LOGIN_BASE_URL` 前缀（默认空，即登录应用部署在域名根路径；部署形态不同时配置该变量），退出登录跳登录页不带回跳参数。

## 兼容性与发布

- IAM Server：`1.1.x`（完整支持递归菜单、默认入口和沉浸展示）
- IAM Contract：`1.1.x`
- 兼容 IAM Server `1.0.x` 的平铺 `menus` 回退；该组合不提供递归菜单、默认入口、全局登录首页或沉浸展示。
- `1.1.0` 对齐 IAM Server `1.1.0` 的 Portal 导航上下文契约。
- 后续 Portal patch 可独立发布，但必须在 release notes 中声明兼容的 Server、Contract 与已挂载微前端范围。

仓库名使用统一应用门户命名；npm package 保留 `@sure-iam/simple-iam-portal-web`。权威 API 契约由 IAM Server 仓库的 `sdk/auth/iam/server/contract/` 维护；不得调用未声明接口。

## 本地开发

前置条件：Node.js 22+、pnpm 9.15.4，以及运行在 `http://localhost:8180` 的 IAM Server。

```bash
npx pnpm@9.15.4 install
npx pnpm@9.15.4 run dev
```

开发服务器固定使用 `5176`，基路径为 `/app/`。`/iam`、`/oauth2` 代理至 IAM Server；IAM 子应用入口 `/app/iam` 与 `/micro` 代理至 IAM Admin（`5175`）。开发环境默认通过 Login（`5174`）维持登录入口。

## 验证

```bash
npx pnpm@9.15.4 run type-check
npx pnpm@9.15.4 run lint
npx pnpm@9.15.4 run test:run
npx pnpm@9.15.4 run build
npx pnpm@9.15.4 run test:browser
```
