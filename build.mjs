// 待确认：无；歧义：无；后续：无；优化：单文件；风险/验证：脚本闭合标签转义和可移植路径。
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
const result = await build({ entryPoints: ['src/widget.ts'], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022', minify: true });
const html = await readFile('src/widget.html', 'utf8');
await writeFile('dist/widget.html', html.replace('/*WIDGET_SCRIPT*/', () => result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')));
await build({ entryPoints: ['src/server.ts'], bundle: true, packages: 'external', outfile: 'dist/server.js', platform: 'node', format: 'esm', target: 'node22' });
