// 待确认：ChatGPT message capability；歧义：允许部分作答；后续：真实内嵌验收。
// 优化：无框架和存储；风险：超时不代表 host 未接收；验证：重置、错误、重复提交和迟到响应。
import { App } from '@modelcontextprotocol/ext-apps';
import { decisionSchema, serializeAnswers } from './decision.js';
const app = new App({ name: 'Decision Block', version: '0.1.0' });
const form = document.querySelector<HTMLFormElement>('form')!;
const questions = document.querySelector<HTMLElement>('#questions')!;
const output = document.querySelector<HTMLOutputElement>('output')!;
const status = document.querySelector<HTMLElement>('#status')!;
const submit = document.querySelector<HTMLButtonElement>('#submit')!;
const reset = document.querySelector<HTMLButtonElement>('#reset')!;
let answers: number[][] = [];
let ready = false;
let sending = false;
let generation = 0;
function update() {
  output.value = serializeAnswers(answers);
  submit.disabled = !ready || sending || !output.value;
  reset.disabled = sending || !answers.length;
}
function notice(text: string) { status.textContent = text; }
app.ontoolresult = result => {
  generation++;
  questions.replaceChildren();
  answers = [];
  const parsed = decisionSchema.safeParse(result.structuredContent);
  if (result.isError || !parsed.success) { notice('问题数据无效，无法显示。'); update(); return; }
  answers = parsed.data.questions.map(() => []);
  parsed.data.questions.forEach((q, qi) => {
    const fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = `Q${qi + 1}〔${q.type === 'single' ? '单选' : '多选'}〕 ${q.text}`;
    fieldset.append(legend);
    const options = document.createElement('div');
    options.className = 'options';
    q.options.forEach((text, oi) => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = q.type === 'single' ? 'radio' : 'checkbox';
      input.name = `q${qi}`;
      input.value = String(oi);
      input.addEventListener('change', () => {
        answers[qi] = Array.from(options.querySelectorAll<HTMLInputElement>('input:checked'), el => Number(el.value));
        notice(ready ? '' : '当前 host 不支持发送消息，无法提交。');
        update();
      });
      const span = document.createElement('span');
      span.textContent = `${String.fromCharCode(65 + oi)} ${text}`;
      label.append(input, span);
      options.append(label);
    });
    fieldset.append(options);
    questions.append(fieldset);
  });
  notice(ready ? '' : '正在确认 host 提交能力…');
  update();
};
app.onhostcontextchanged = ctx => { if (ctx.theme) document.documentElement.dataset.theme = ctx.theme; };
app.onteardown = async () => { ready = false; generation++; update(); return {}; };
reset.addEventListener('click', () => {
  form.reset();
  answers = answers.map(() => []);
  notice(ready ? '' : '当前 host 不支持发送消息，无法提交。');
  update();
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submit.disabled) return;
  const text = output.value;
  const current = generation;
  sending = true;
  questions.querySelectorAll('fieldset').forEach(el => { el.disabled = true; });
  notice('正在提交…'); update();
  try {
    const result = await app.sendMessage({ role: 'user', content: [{ type: 'text', text }] }, { signal: AbortSignal.timeout(15000) });
    if (generation === current) notice(result.isError ? '提交失败，选择已保留，可重试。' : '已提交');
  } catch {
    if (generation === current) notice('提交未确认，选择已保留；重试前请检查对话，避免重复发送。');
  } finally {
    sending = false;
    questions.querySelectorAll('fieldset').forEach(el => { el.disabled = false; });
    update();
  }
});
app.connect().then(() => {
  ready = Boolean(app.getHostCapabilities()?.message);
  const theme = app.getHostContext()?.theme;
  if (theme) document.documentElement.dataset.theme = theme;
  notice(ready ? (answers.length ? '' : '等待问题数据…') : '当前 host 不支持发送消息，无法提交。');
  update();
}).catch(() => { ready = false; notice('无法连接 MCP Apps host。请从兼容的 host 打开组件。'); update(); });
