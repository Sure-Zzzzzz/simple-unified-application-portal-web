# simple-unified-application-portal-web 1.1.1 Changelog

## 发布信息

- 版本：`1.1.1`
- 类型：Feature / 向后兼容能力扩展
- 基线版本：`1.1.0`

## 主要变更

- 向已挂载的 IAM Admin 子应用提供受控 `refreshPortalNavigation` 回调，支持管理端保存 Portal 应用顺序后立即刷新当前壳导航。
- 导航刷新只重新读取应用列表和重算当前激活态，不改写当前子路由、不重新注册微前端，也不改变应用准入与页面权限判断。
- 保持服务端返回顺序作为唯一展示顺序，兼容旧响应时继续保留原始数组顺序。

## 兼容性

| 依赖 | 兼容范围 |
| --- | --- |
| IAM Server | `1.1.x` |
| IAM Contract | `1.1.x` |
| IAM Admin Web | `1.1.1` 或不使用刷新回调的旧版本 |
| IAM Theme Contract | `1.0.1` |

## 验证范围

- `vue-tsc`、ESLint、Vitest 覆盖率和生产构建通过。
- 单元测试覆盖微前端 props 中的导航刷新回调注入。
- Playwright 生产构建测试通过，覆盖沉浸仪表盘下钻和 Portal 导航基础流程。
