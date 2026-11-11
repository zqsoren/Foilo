# TODO MCP

设置入口：AI 助手右上角三横 → `/todo/settings`。设置页提供个人 API Key、连接配置、调用次数、最近调用时间和操作，以及重新生成／停用。

## 客户端连接

服务地址：`https://life-152-32-131-4.nip.io/api/todo/mcp`

采用官方 TypeScript MCP SDK 的无状态 Streamable HTTP（JSON 响应）。每次请求携带 `Authorization: Bearer <个人APIKey>`。支持可配置远程 HTTP 及自定义请求头的客户端；未实现 OAuth 授权流程，仅支持 OAuth 的客户端暂不兼容。通用 JSON 示例在设置页，可替换成各客户端要求的配置格式。

服务实现初始化、工具发现、工具调用及标准协议校验。GET/SSE 和 DELETE 会话终止返回 405（无持久会话）；POST 由 SDK 处理。支持的协议版本随 SDK 1.32.1。浏览器外站 Origin 被拒绝，不开放跨站 CORS。

## 工具

- `get_day_schedule`：指定日期（默认北京时间今天），分页列表 + 全天总数、已完成/未完成统计 + revision。包含标题、时间、备注、重复规则、是否可编辑，不含聊天或其他工作台模块。
- `get_event_details`：以 ID 和可选 occurrence_date 读取细节与 revision。重复日程必须指定具体日期。
- `create_event`：新建，支持每天/每周/自定义星期重复。
- `update_event`：修改标题、备注、日期、开始/结束时间或完成状态；只允许当天及未来未完成任务。
- `delete_event`：删除一个符合上述权限的日程或重复实例。
- `update_events`：最多 50 个修改原子提交，适合顺序交换／整天重排。

所有写操作必须提供 `expected_revision`（先读后写）与 `request_id`（UUID）。网络重试复用同一 request_id；不同操作使用新 ID。同 ID 不同内容拒绝。最近 1000 个写请求保留响应供重试返回；超出保留窗口的旧 revision 仍拒绝覆盖。相同 key 的请求通过 SQLite 事务保证检查和写入一致。

过去日期和已完成任务只能读取；重复任务只操作指定那一天，不可远程改整个系列。共享已有日程校验，禁止时间重叠并保留 5 分钟缓冲。写入同一 todo_workspaces 数据，页面原有撤销仍可用。

## 账号与数据

`todo_mcp_keys` 按用户独立存储 SHA-256 哈希，不保存明文；生成时仅返回一次，365 天过期，重新生成使旧 key 立即失效，停用即删除，账号禁用即拒绝。与登录会话和只读小组件连接码完全分离。只能由登录会话 + 同站 Origin 管理 key，MCP key 无法访问管理接口。

用户身份只来自密钥查询，所有工具查询/更新绑定该 user_id，不接收调用者指定 userId。每个 HTTP 请求创建独立的无状态 MCP 实例，避免跨账号会话复用。请求体最多 128 KiB。响应 private/no-store，不缓存私人日程。

`todo_mcp_requests` 保存同账号写请求的哈希和结果以处理重试；不记录 Authorization、模型密钥或用户聊天。设置页调用记录仅含最近工具名、时间、调用计数。

## 验证

`tests/todo-mcp.test.ts` 使用内存数据库验证用户隔离、过期/停用、幂等、并发版本保护、回滚、重复单日修改，以及官方 Client + StreamableHTTPClientTransport 的协议互通。

`scripts/smoke-todo-mcp.mjs BASE_URL FIXTURE_FILE` 使用专门临时账号做实际 HTTP 验证；fixture 文件必须私有权限，验证后删除临时账号和文件，勿使用真实用户账号做写入测试。

本次同时将 Next.js/eslint-config-next 升级至 16.3.8 修复安装依赖时发现的已知生产漏洞；生产依赖审计无已知漏洞。开发工具仍有上游审计提示，未跨大版本改动工具链。
