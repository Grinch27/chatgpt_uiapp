// 待确认：ChatGPT；歧义：测试 host 使用官方 AppBridge；后续：真机；优化：无额外测试框架。
// 风险/验证：只监听 localhost；测试进程自动关闭；截图仅本地，浏览器需已安装。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const child = spawn(process.execPath, ['dist/server.js'], { env: { ...process.env, PORT: '3001' }, stdio: ['ignore','pipe','pipe'] });
let log = ''; child.stdout.on('data', x => { log += x; }); child.stderr.on('data', x => { log += x; });
let browser, host, client;
const summary = [];
function pass(s) { summary.push(s); console.log('PASS', s); }
try {
  await new Promise((resolve,reject) => {
    const timer = setTimeout(() => reject(Error('Server startup timed out')),10000);
    child.stdout.on('data', () => { clearTimeout(timer); resolve(); });
    child.on('exit', code => { clearTimeout(timer); reject(Error(`Startup failed ${code}: ${log}`)); });
  });
  assert.deepEqual(await (await fetch('http://127.0.0.1:3001/health')).json(),{status:'ok'});
  assert.equal((await fetch('http://127.0.0.1:3001/health',{headers:{Origin:'https://example.com'}})).status,403);
  pass('health and cross-origin rejection');
  client = new Client({name:'decision-verifier',version:'0.1.0'});
  await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:3001/mcp')));
  const {tools} = await client.listTools();
  assert.deepEqual(tools.map(t=>t.name),['decision_block']);
  const input = { questions:[{type:'single',text:'主线？',options:['LOS20','LOS21','LOS23']},{type:'multi',text:'调查范围？',options:['update_engine','super','snapshot']}] };
  const result = await client.callTool({name:'decision_block',arguments:input});
  assert.deepEqual(result.structuredContent,input);
  const uri = tools[0]._meta.ui.resourceUri;
  assert.equal(result._meta.ui.resourceUri,uri);
  const resource = await client.readResource({uri});
  assert.match(resource.contents[0].mimeType,/text\/html/);
  for (const invalid of [{questions:[]},{questions:[{...input.questions[0],options:Array(27).fill('x')}]},{questions:[{...input.questions[0],text:' '}]}]) {
    assert.equal((await client.callTool({name:'decision_block',arguments:invalid})).isError,true);
  }
  pass('official MCP client: tools/list, tools/call, invalid input and resources/read');
  const bundled = await build({entryPoints:['test/host.ts'],bundle:true,write:false,format:'esm',platform:'browser'});
  let fixture = {input,result};
  host = createServer((req,res) => {
    if(req.url==='/fixture') {res.setHeader('Content-Type','application/json');res.end(JSON.stringify(fixture));}
    else if(req.url==='/host.js') {res.setHeader('Content-Type','text/javascript');res.end(bundled.outputFiles[0].text);}
    else if(req.url==='/widget') {res.setHeader('Content-Type','text/html');res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'");res.end(resource.contents[0].text);}
    else {res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><style>body{margin:0}iframe{width:100%;height:650px;border:0}output{overflow-wrap:anywhere}</style><iframe sandbox="allow-scripts allow-same-origin"></iframe><output></output><script type="module" src="/host.js"></script>');}
  });
  await new Promise(r=>host.listen(0,'127.0.0.1',r));
  browser = await chromium.launch({headless:true});
  const page = await browser.newPage();
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const url=`http://127.0.0.1:${host.address().port}`;
  await page.goto(url);
  const f = page.frameLocator('iframe');
  await f.locator('input').first().waitFor();
  assert.equal(await f.locator('input[type=radio]').count(),3);
  assert.equal(await f.locator('input[type=checkbox]').count(),3);
  assert.equal(await f.locator('#submit').isDisabled(),true);
  await f.getByText('A LOS20',{exact:true}).click();
  await f.getByText('C LOS23',{exact:true}).click();
  assert.equal(await f.locator('input[type=radio]:checked').count(),1);
  assert.equal(await f.locator('input[type=radio]').first().isChecked(),false);
  await f.getByText('C snapshot',{exact:true}).click();
  await f.getByText('A update_engine',{exact:true}).click();
  assert.equal(await f.locator('output').textContent(),'Q1=C;Q2=A+C');
  pass('native controls, clickable labels, radio exclusivity, multi and live serialization');
  await f.locator('#submit').click();
  await f.getByText('已提交',{exact:true}).waitFor();
  assert.deepEqual(JSON.parse(await page.locator('output').textContent()),{role:'user',content:[{type:'text',text:'Q1=C;Q2=A+C'}]});
  assert.equal(await f.locator('input:checked').count(),3);
  pass('App.sendMessage -> official AppBridge ui/message, exact user payload, selection retained');
  for(const width of [320,375,768,1280]) {
    await page.setViewportSize({width,height:800});
    assert.equal(await f.locator('body').evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
  }
  await mkdir('.test-artifacts',{recursive:true});
  await page.screenshot({path:'.test-artifacts/decision-desktop.png'});
  pass('320/375/768/1280 widths without horizontal overflow');
  await f.locator('#reset').click();
  assert.equal(await f.locator('input:checked').count(),0);
  assert.equal(await f.locator('output').textContent(),'');
  assert.equal(await f.locator('#submit').isDisabled(),true);
  assert.equal(JSON.parse(await page.locator('output').textContent()).content[0].text,'Q1=C;Q2=A+C');
  pass('reset clears controls/result and sends no new message');
  fixture={input,result,reject:true};await page.reload();
  await f.getByText('A LOS20',{exact:true}).click();await f.locator('#submit').click();
  await f.getByText('提交失败，选择已保留，可重试。',{exact:true}).waitFor();
  assert.equal(await f.locator('input:checked').count(),1);
  pass('host rejection retains selection and reports failure');
  fixture={input,result,noMessage:true};await page.reload();
  await f.getByText('A LOS20',{exact:true}).click();
  await f.getByText('当前 host 不支持发送消息，无法提交。',{exact:true}).waitFor();
  assert.equal(await f.locator('#submit').isDisabled(),true);
  pass('missing message capability disables submission');
  fixture={input,result:{structuredContent:{questions:[]},content:[]}};await page.reload();
  await f.getByText('问题数据无效，无法显示。',{exact:true}).waitFor();
  assert.equal(await f.locator('input').count(),0);
  pass('malformed structuredContent handled');
  assert.deepEqual(errors,[]);pass('no browser exceptions or CSP/console errors');
  await writeFile('.test-artifacts/results.json',JSON.stringify({date:new Date().toISOString(),summary,browser:browser.version()},null,2));
} finally {
  await browser?.close();
  if(host) await new Promise(r=>host.close(r));
  await client?.close();
  child.kill();
}
