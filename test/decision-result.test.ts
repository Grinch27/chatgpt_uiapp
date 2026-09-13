// 待确认：无；歧义：无；后续：UI 联测；优化：无；风险/验证：编号边界与非法输入。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decisionSchema, serializeAnswers } from '../src/decision.js';
for (const [name, input, expected] of [
  ['single', [[1]], 'Q1=B'], ['multi', [[2,0]], 'Q1=A+C'],
  ['multiple', [[1],[2,0],[],[3]], 'Q1=B;Q2=A+C;Q4=D'],
  ['sorting', [[2,0,1,0]], 'Q1=A+B+C'], ['unselected', [[],[0]], 'Q2=A'],
  ['reset', [[],[]], ''], ['empty', [], ''], ['Z', [[25]], 'Q1=Z'],
] as const) test(name, () => assert.equal(serializeAnswers(input), expected));
test('invalid index', () => { for (const n of [-1,26,0.5,NaN]) assert.throws(() => serializeAnswers([[n]])); });
test('schema rejects malformed and excessive inputs', () => {
  const q = {type:'single',text:'Question',options:['a','b']};
  for (const value of [{}, {questions:[]}, {questions:[{...q,text:' '}]}, {questions:[{...q,type:'other'}]}, {questions:[{...q,options:['a',' ']}]}, {questions:[{...q,options:['a']}]}, {questions:[{...q,options:Array(27).fill('x')}]}, {questions:Array(31).fill(q)}, {questions:[{...q,id:'Q1'}]}]) assert.equal(decisionSchema.safeParse(value).success,false);
  assert.equal(decisionSchema.safeParse({questions:Array(30).fill({...q,options:Array(26).fill('x')})}).success,true);
});
