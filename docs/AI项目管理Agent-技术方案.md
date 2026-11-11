# AI 项目管理 Agent 技术方案

## 已确认的产品规则

- 项目结构为：项目 → 阶段 → 一次性任务 + 阶段周期任务。
- 不存在“项目周期任务”。
- 新建项目只强制填写项目名称，默认状态为“规划中”。
- 项目状态仅由用户手动切换：规划中、进行中、已完成。
- 完成最后一个阶段不会自动把项目改为“已完成”。
- 每个项目拥有多段彼此独立、永久保存的 AI 对话。
- 新建对话不读取旧对话或旧摘要，但仍读取当前项目结构化数据。
- 长对话通过摘要和最近消息窗口控制上下文长度。
- 不支持 PDF、Word、图片或其他项目附件。
- Domain Skill 只作为内部上下文，界面不提供查看或编辑入口。
- 普通修改在聊天内确认，只展示原内容和新内容。
- 重大修改进入独立预览页，必须展示调整原因。
- 非顺序切换阶段属于重大修改。
- 每个项目只保留最近一次已确认 AI 修改的撤销资格。
- 每周一 13:00 只检查“进行中”项目；错过后在下次打开项目页时补建检查任务。
- AI 服务商、模型、API 地址和密钥在工作台全局设置中配置，不属于单个项目。
- 当前不支持本地模型。

## Agent 调用边界

```text
用户消息
  → 项目上下文组装
  → Core Prompt + 隐藏 Domain Skill
  → Provider Adapter
  → conversation | action_proposal
  → 服务端结构校验
  → 用户确认
  → 数据库事务
  → 保留一次撤销快照
```

模型永远不能直接执行 SQL，也不能把自然语言中的“我已经修改”视为真实写入。

## 数据表

### `projects`

- `workflow_status`：`planning | active | completed`
- 旧的 `status` 字段继续作为兼容字段，由服务端动作同步维护。

### `project_ai_conversations`

- `project_id`：所属项目
- `title`：对话名称
- `summary`：长对话摘要
- `summarized_through_message_id`：摘要覆盖到的最后一条消息
- `created_at`、`updated_at`

### `project_ai_messages`

- `conversation_id`
- `role`：`user | assistant`
- `message_type`：`chat | weekly_report`
- `content`
- `created_at`

### `project_ai_change_sets`

- `change_kind`：`ordinary | major`
- `status`：`proposed | applied | rejected | undone | superseded`
- `title`
- `reason`：普通修改为空，重大修改必填
- `operations_json`：通过 Zod 校验的结构化操作
- `before_snapshot_json`、`after_snapshot_json`
- `applied_at`、`undone_at`

数据库唯一索引保证同一个项目最多只有一条 `applied` 修改，因此只允许撤销最近一次 AI 修改。

### `project_ai_domain_skills`

- `project_id`
- `version`
- `content`
- `created_at`

该表没有任何用户界面入口。

### `project_weekly_checks`

- `project_id`
- `week_key`
- `scheduled_at`
- `status`：`pending | completed | skipped`
- `report_message_id`
- `attempted_at`：最近一次调用时间；失败后至少间隔 6 小时再重试
- `completed_at`

`project_id + week_key` 唯一，避免应用重复打开时生成多次周检。

## Provider 接口

`ProjectAiProvider` 是服务商无关的适配层。当前已经实现 OpenAI Chat Completions 兼容协议，可连接 12API 等中转服务：

```ts
interface ProjectAiProvider {
  readonly id: string;
  send(context: ProjectAgentContext, options?: SendOptions): Promise<ProjectAgentResponse>;
  summarize(previousSummary: string | null, messages: ProjectMessage[]): Promise<string>;
  testConnection(): Promise<void>;
}
```

`ProjectAgentContext` 只包含当前项目的结构化数据、当前对话摘要和最近 24 条消息，不包含附件或其他项目的对话。

当前请求规则：

- 请求地址：`{Base URL}/chat/completions`。
- 认证：`Authorization: Bearer {API Key}`。
- API Key 只在服务端从本地 SQLite 读取，不返回浏览器。
- 项目对话通过提示词约束为 JSON，并经过 Zod 结构校验；不依赖部分中转站不支持的 `response_format` 参数。模型若直接返回纯文本，只按普通对话显示，绝不会写入项目；项目修改仍必须通过结构校验。
- 网络断开或服务端临时错误自动重试一次；认证、余额、模型和限流错误转换为可读提示。
- 当前采用非流式响应，完整回复到达后一次显示。
- 对话达到 36 条未摘要消息时，保留最近 20 条，并把更早内容合并到永久摘要。
- 每周检查同样通过 Provider 执行，且只能返回报告，不能生成项目修改操作。
- 周检使用独立后台请求，不占用页面的 Server Action 队列；失败后至少间隔 6 小时再重试，避免刷新页面时反复请求。

## 已支持的结构化操作

- 替换完整项目规划
- 修改项目目标或完成标准
- 修改阶段名称
- 新增一次性任务或阶段周期任务
- 删除任务
- 设置当前阶段

完整项目规划确认后一次性写入目标、完成标准、阶段和任务，项目仍保持原状态，由用户手动切换。

## 后续增强

1. 增加流式响应，让长回复逐字显示。
2. 对 API Key 使用系统密钥存储做进一步加固。
3. 如需支持其他协议，只新增对应 Provider Adapter，不改项目业务层。
