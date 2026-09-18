# Secure MCP Tunnel：接入 ChatGPT 对话

## 目标与当前状态

用户已选择 Secure MCP Tunnel。最终验收是 ChatGPT 对话内出现 Decision Block、可选择并提交纯结果；Docker 启动和 tunnel 在线均不是最终验收。

2026-09-15 已读取官方指南和 release metadata：最新公开 tunnel-client release 为 v0.0.14。本机 PATH 未找到 tunnel-client。尚未下载客户端、启动 Docker、创建隧道、配置凭据或绑定 ChatGPT。账号可用性、费用及权限未确认。

## 拓扑

```text
ChatGPT developer-mode App（Connection: Tunnel）
  → OpenAI tunnel endpoint
  ← 宿主机 tunnel-client 发起出站 HTTPS、拉取并返回 MCP 请求
  → http://127.0.0.1:3001/mcp
  → 本机 Ubuntu Docker / decision-block
```

初版将 tunnel-client 放在宿主机，连接现有 Docker 回环映射。这样不需修改应用 Host 白名单，也不需创建公网域名、入站防火墙规则或公共 tunnel。业务服务仍运行在 Ubuntu Docker 中。

不要直接把另一个容器中的 `127.0.0.1` 当作业务容器地址；若日后容器化 tunnel-client，需要单独明确网络命名空间与 Host 校验。

## 必需账号条件

1. 在 https://platform.openai.com/settings/organization/tunnels 创建或选择 tunnel，获得真实 tunnel_id。
2. 创建/编辑需要组织级 Tunnels Read + Manage；运行客户端和创建 App 时选择 tunnel 需要 Read + Use。
3. 将 tunnel 关联到目标 ChatGPT 工作区；只关联 Platform organization 不保证该工作区可见。
4. 准备 tunnel-client 使用的 runtime API key。组件本身不调用模型 API，但隧道需要此凭据。
5. ChatGPT 账号/工作区还需 Developer mode 权限；它与 Platform tunnel 权限独立。

不将 API key 写入 Git、Dockerfile、Compose、README 或对话。未明确批准时，不替用户创建凭据或更改账号权限。不要声称此路径免费；费用与账号条件尚未核验。

## 本地准备与运行顺序（未执行）

1. 使用项目 README 的 Docker 构建和启动步骤，确认本机 `/health` 与 `/mcp` 可达。
2. 从 Platform tunnel 设置页或官方最新 release 获取匹配主机架构的 tunnel-client：
   https://github.com/openai/tunnel-client/releases/latest
   核对同一 release 的 SHA256SUMS.txt；不要下载名称含 runtime-cloudflared 的资产代替 tunnel-client 主程序。
3. 阅读实际安装版本的帮助：

```bash
tunnel-client help quickstart
tunnel-client init --help
```

4. 按该版本 HTTP profile 用法配置：
   - profile 名称：chatgpt-uiapp
   - tunnel_id：用户实际创建的值，不使用示例 ID。
   - MCP server URL：http://127.0.0.1:3001/mcp
   官方指南说明 HTTP 模式使用 `--mcp-server-url`，不要套用 stdio sample。具体 sample 名称和配置文件位置需以下载版本的 help 为准，当前未确认。
5. 仅在本地终端以不回显方式提供官方文档要求的环境变量，然后运行 profile。以下 bash 片段不包含真实密钥：

```bash
# 待确认：profile 已正确创建；歧义：无；后续：对话验收。
# 风险：凭据仅在本地环境中使用；验证重点：不回显、不写历史、不启用 set -x。
read -r -s -p 'Tunnel runtime API key: ' CONTROL_PLANE_API_KEY
printf '\n'
export CONTROL_PLANE_API_KEY
tunnel-client doctor --profile chatgpt-uiapp --explain
# doctor 无阻塞后再执行；run 为前台进程。
tunnel-client run --profile chatgpt-uiapp
# 退出 run 后清除当前 shell 中的变量。
unset CONTROL_PLANE_API_KEY
```

doctor 与 run 会使用凭据连接 OpenAI，不属于纯离线验证。保持 run 在线，否则 App 工具发现和调用会失败。客户端本地管理界面的实际端口以运行输出为准，不凭空假设。

## ChatGPT 接入

在 https://chatgpt.com/plugins 创建 developer-mode App，名称可用 Decision Block，Connection 选择 Tunnel，再选择或输入真实 tunnel_id。

如列表中找不到 tunnel，检查目标工作区关联和 Read + Use 权限；不要改成公共 HTTP 服务规避权限。

在目标 ChatGPT 对话启用该 App，然后提出：

> 使用 decision_block 展示两题：第一题单选“主线？”，选项 LOS20、LOS21、LOS23；第二题多选“调查范围？”，选项 update_engine、super、snapshot。

验收：
- 对话中实际出现原生 radio/checkbox。
- 选择第一题 C、第二题 C 和 A，实时显示 `Q1=C;Q2=A+C`。
- 点击提交，当前对话收到精确纯文本 `Q1=C;Q2=A+C`。
- 模型继续响应，选择仍保留。
- 无 message capability、发送失败和重置行为应单独检查。

不把 Codex 当前任务注册状态等同于 ChatGPT App 注册状态；需要在实际目标客户端验证。

## 边界和来源

私有指 MCP 服务无公网入站监听；MCP 请求及响应仍经 OpenAI 通道传输。通道建立和账号配置需明确授权，真实凭据只能本地处理。

- 官方指南：https://developers.openai.com/api/docs/guides/secure-mcp-tunnels
- 官方接入：https://developers.openai.com/plugins/deploy/connect-chatgpt
- 客户端下载：https://github.com/openai/tunnel-client/releases/latest

现有构建、浏览器和 ChatGPT 验收均未因编写本文而通过。后续以实际运行证据更新状态。
