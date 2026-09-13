// 待确认：真实 ChatGPT host；歧义：允许部分作答；后续：真机验收。
// 优化：暂不分页；风险：超长输入；验证：边界校验、排序、去重和空结果。
import { z } from 'zod';
export const decisionSchema = z.strictObject({
  questions: z.array(z.strictObject({
    type: z.enum(['single', 'multi']),
    text: z.string().trim().min(1).max(2000),
    options: z.array(z.string().trim().min(1).max(500)).min(2).max(26),
  })).min(1).max(30),
});
export type Decision = z.infer<typeof decisionSchema>;
export function serializeAnswers(answers: readonly (readonly number[])[]): string {
  return answers.flatMap((values, i) => {
    if (values.some(v => !Number.isInteger(v) || v < 0 || v > 25)) throw new RangeError('Option index must be 0..25');
    const letters = [...new Set(values)].sort((a, b) => a - b).map(v => String.fromCharCode(65 + v));
    return letters.length ? [`Q${i + 1}=${letters.join('+')}`] : [];
  }).join(';');
}
