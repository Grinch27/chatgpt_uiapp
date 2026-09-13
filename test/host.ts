// 待确认：真实 ChatGPT；歧义：此为本地 SDK 测试 host；后续：basic-host/真机；风险/验证：不等价于 ChatGPT。
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';
const frame = document.querySelector('iframe')!;
const config = await (await fetch('/fixture')).json();
const bridge = new AppBridge(null, { name: 'Decision test host', version: '0.1.0' }, config.noMessage ? {} : { message: {} });
bridge.onmessage = async params => {
  if (config.reject) return { isError: true };
  document.querySelector('output')!.textContent = JSON.stringify(params);
  return {};
};
bridge.oninitialized = () => {
  void (async () => {
    await bridge.sendToolInput({ arguments: config.input });
    await bridge.sendToolResult(config.result);
  })();
};
await bridge.connect(new PostMessageTransport(frame.contentWindow!, frame.contentWindow!));
frame.src = '/widget';
