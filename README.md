# 在侧 Folio（原人生工作台）

在侧 Folio 的项目仓库，包含早期本机工作台、ToDo、共用登录及宣传页等内容。本地开发数据保存在 SQLite；各模块的设计、实现和线上状态见[设计日志总入口](docs/设计日志/在侧Folio-新窗口交接.md)。

新窗口先读[协作总则](docs/设计日志/00-总则.md)，按场景索引进入对应模块；根目录 [AGENTS.md](AGENTS.md)引导 AI 找到总则。两台电脑的 GitHub、设计文件与数据约定见[跨设备同步](docs/设计日志/跨设备同步.md)。

## 启动

需要 Node.js 22 或更高版本。

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

浏览器打开 `http://127.0.0.1:3000`。

## 在另一台电脑继续

项目仓库：[zqsoren/Foilo](https://github.com/zqsoren/Foilo)。第一次使用时下载完整项目：

```bash
git clone https://github.com/zqsoren/Foilo.git
cd Foilo
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

在 AI 工具中打开下载后的项目根目录，先读 [协作总则](docs/设计日志/00-总则.md)，再进入对应模块。浏览器打开 `http://127.0.0.1:3000/login`，使用独立的本地开发账号；线上账号和真实数据不会随源码下载。

以后接手前先检查本机未提交改动，再同步对应分支；工作结束后，把源码与设计记录一起提交并推送。详细步骤见[跨设备同步](docs/设计日志/跨设备同步.md)。

仓库包含网站、独立宣传页、Mac 端源码、文档和必要设计素材。依赖安装目录、构建产物、真实数据库、凭据和聊天备份留在本机；宣传页入口为 `folio-landing/index.html`，可用静态网页服务单独预览。GitHub 保存项目文件，线上网站仍按原发布流程更新。

## 常用命令

```bash
npm run build       # 生产构建
npm test            # 自动化测试
npm run lint        # 代码检查
npm run typecheck   # 类型检查
npm run backup      # 立即备份本地数据库
```

数据库位于 `data/life-workbench.sqlite`。自动/手动备份位于 `backups/`，默认保留最近 14 份。产品规则与技术细节见 [产品需求文档](docs/人生工作台-MVP-技术增强版PRD.md)。
