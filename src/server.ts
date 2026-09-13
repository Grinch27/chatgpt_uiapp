// 待确认：外部 host 兼容性；歧义：无；后续：经批准后接入 ChatGPT。
// 优化：保持无状态；风险：禁止直接公网部署；验证：MCP、非法输入、端口冲突。
import express from 'express';
import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { decisionSchema } from './decision.js';
export const resourceUri = 'ui://decision-block/widget.html';
const widget = readFileSync(new URL('./widget.html', import.meta.url), 'utf8');
export function createServer() {
  const server = new McpServer({ name: 'decision-block', version: '0.1.0' });
  registerAppTool(server, 'decision_block', {
    title: 'Decision Block',
    description: 'Display an inline decision form. Supply question text, single/multi type and options; numbering is automatic.',
    inputSchema: decisionSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri } },
  }, async (input) => ({
    content: [{ type: 'text', text: `Interactive decision block containing ${input.questions.length} questions.` }],
    structuredContent: decisionSchema.parse(input),
    _meta: { ui: { resourceUri } },
  }));
  registerAppResource(server, 'Decision widget', resourceUri, { mimeType: RESOURCE_MIME_TYPE }, async () => ({
    contents: [{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: widget,
      _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] } } } }],
  }));
  return server;
}
const app = express();
app.disable('x-powered-by');
// localhost binding alone does not prevent DNS rebinding or cross-origin browser requests.
app.use((req, res, next) => {
  if (!['127.0.0.1', 'localhost'].includes(req.hostname)) { res.sendStatus(403); return; }
  const origin = req.get('origin');
  if (origin) {
    try { if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) { res.sendStatus(403); return; } }
    catch { res.sendStatus(403); return; }
  }
  next();
});
app.use(express.json({ limit: '1mb' }));
app.get('/health', (_req, res) => { res.json({ status: 'ok' }); });
app.all('/mcp', async (req, res) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => { void transport.close().catch(() => {}); void server.close().catch(() => {}); });
  try { await server.connect(transport); await transport.handleRequest(req, res, req.body); }
  catch { if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal server error' } }); }
});
// Never echo malformed request bodies into the response or access logs.
app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(400).json({ error: 'Invalid request body' });
});
const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be 1..65535');
const listener = app.listen(port, '127.0.0.1', () => console.log(`Decision Block: http://127.0.0.1:${port}/mcp`));
listener.on('error', (error: NodeJS.ErrnoException) => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use` : `Server failed: ${error.code ?? 'unknown'}`);
  process.exitCode = 1;
});
