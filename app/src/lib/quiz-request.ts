// What the browser sends /api/coach-quiz.

import { z } from "zod";

export const QuizRequestSchema = z.object({
  course: z.string().min(1).max(100),
  task: z.string().max(1000),
  problem: z.boolean(),
  topics: z
    .array(z.object({ label: z.string().max(200), name: z.string().max(300).optional(), reading: z.string().max(300).optional() }))
    .min(1)
    .max(12),
  excerpts: z.array(z.string().max(500)).max(40),
});
export type QuizRequest = z.infer<typeof QuizRequestSchema>;
