# Decision Block：本地 Docker 初版

一个 Vanilla TypeScript MCP Apps 决策组件：原生单选/多选、自动编号、实时结果、重置及向 host 提交。无账号、数据库、API Key 或持久存储。

已选定通过 **Secure MCP Tunnel** 接入 ChatGPT 对话，步骤见 [SECURE_TUNNEL.md](SECURE_TUNNEL.md)。上述“无 API Key”指业务组件；隧道客户端需要单独的 runtime API key、tunnel_id 和工作区权限。当前尚未连接，不能在对话中直接使用。

## 当前状态

2026-09-15 增加 Docker 配置。按用户此前暂停要求，本轮未构建镜像、未启动容器、未执行测试。以下是待执行操作，不是部署成功记录。

## 技术栈

- 最终基础镜像：`ubuntu:latest`；当前官方标签对应 Ubuntu 26.04，未来可能变化。
- Node.js：`24.21.0`，本次核验的最新 LTS。从官方 `node:24.21.0-bookworm-slim` 镜像复制运行时至 Ubuntu。
- pnpm：`12.4.2`，本次 registry 查询的最新正式版；与现有 lockfile 的实际安装兼容性待验证。
- Docker Engine + Compose 插件。本机只读检测为 Engine 29.8.0、Compose 5.5.1，未修改安装。
- MCP SDK、Express、Zod 保持 package.json / pnpm-lock.yaml 的现有版本，不自动进行业务依赖主版本迁移。

官方参考：[Ubuntu 镜像](https://hub.docker.com/_/ubuntu)、[Node 发布状态](https://nodejs.org/en/about/previous-releases)、[pnpm 发布元数据](https://registry.npmjs.org/pnpm/latest)。

## 启动

需要已安装并可访问 Docker Engine 的本地 Linux 环境，无需宿主机 Node/npm/pnpm。先确保端口可用。

```bash
cd /home/user/github/chatgpt_uiapp
docker compose build --pull
docker compose up -d
docker compose ps
curl --fail --silent --show-error http://127.0.0.1:3001/health
```

预期健康响应：`{"status":"ok"}`。构建会拉取镜像和公开软件依赖，只发送公开包请求，不需要上传源码。当前 Docker context 位于本机；不要改用远程 Docker daemon/builder，否则会传输构建上下文。

MCP endpoint：`http://127.0.0.1:3001/mcp`。`/` 未提供网站首页，直接访问不是组件预览；组件由兼容 MCP Apps host 读取 resource 并嵌入。

端口冲突时，在启动命令前指定宿主机端口：

```bash
LOCAL_PORT=3002 docker compose up -d
```

容器内部仍为 3001；宿主机访问改为 `http://127.0.0.1:3002/mcp`。

## 停止与查看日志

```bash
docker compose logs --tail=100 decision-block
docker compose stop
```

日志仅用于本地诊断，不上传。配置没有数据卷；应用不记录问题或答案。

## 网络和运行边界

- 容器内 `HOST=0.0.0.0`，使 Docker 端口转发可达。
- 宿主机只发布 `127.0.0.1:3001`，不向局域网或公网开放。
- 服务仍校验 Host 和非空 Origin，仅允许 localhost / 127.0.0.1。`HOST` 是监听地址，不是允许访问的域名。
- 未配置 TLS、反向代理、tunnel、身份认证或限流。不要直接把端口绑定改为公网。
- 以 UID/GID 10001 运行、只读根文件系统、无额外 capabilities，限制进程数和内存。
- host 不支持 message capability 时禁止提交；容器启动成功不代表 ChatGPT 内嵌链路通过。

## 构建结构与更新

Dockerfile 分离构建依赖、生产依赖和运行阶段。运行阶段保留 `dist/server.js`、`dist/widget.html`、生产 node_modules 和 package.json；不需要宿主机已有 dist/node_modules。

`ubuntu:latest` 是用户要求的浮动标签。更新 Ubuntu 基础层使用 `docker compose build --pull`，已运行容器不会自动更新。Node/pnpm 固定到本次查询的稳定版本，后续升级需要同步 Dockerfile 与 package.json，并重新验证。需要严格复现时，另行将 Ubuntu 镜像固定为已验证 digest。

## 待恢复的验证

本轮没有执行以下步骤：镜像拉取与构建、pnpm 12 frozen-lockfile 安装、容器启动、健康检查、Host/Origin 拒绝路径、MCP 工具/资源、真实浏览器交互。

此前非 Docker 环境通过的 typecheck、build、10 项单测和 MCP 基础检查，不作为本版 Docker 验收结果。

构建阶段只执行应用编译，不执行单测和 typecheck。用户恢复验证后，再独立执行这些检查。真实 ChatGPT 接入、公网 tunnel、账号配置和发布仍需明确批准。

## 结果协议

输入 1..30 题，每题 2..26 个选项，类型 single / multi。输出例如 `Q1=C;Q2=A+C`：未选题省略，多选按字母升序，题间分号，同题加号，不含空格。重置不发送消息；提交成功保留选择，失败或超时有明确提示。
