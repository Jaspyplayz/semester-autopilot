import { globSync, readFileSync } from "node:fs";
import path from "node:path";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const BOUNDARY = "server boundary";
const APP_ROOT = path.resolve(import.meta.dirname, "../..");

let eslint: ESLint;
beforeAll(() => {
  eslint = new ESLint({ cwd: APP_ROOT });
});

async function boundaryErrors(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((m) => m.severity === 2 && m.message.includes(BOUNDARY)).map((m) => m.message);
}

const CLIENT = "src/components/Fixture.tsx";

describe("code outside the server boundary", () => {
  it.each([
    ["alias", 'import { LLM_MODEL } from "@/lib/llm.server";\nexport const m = LLM_MODEL;'],
    ["relative", 'import { LLM_MODEL } from "../lib/llm.server";\nexport const m = LLM_MODEL;'],
    ["sibling", 'import { LLM_MODEL } from "./llm.server";\nexport const m = LLM_MODEL;'],
    ["explicit extension", 'import { LLM_MODEL } from "../lib/llm.server.ts";\nexport const m = LLM_MODEL;'],
    ["type only", 'import type { QuizOutput } from "@/lib/quiz-llm.server";\nexport type Q = QuizOutput;'],
    ["re-export", 'export { canvasGet } from "@/lib/canvas-http.server";'],
    ["dynamic import", 'export const load = () => import("@/lib/canvas.server");'],
    ["dynamic import of a route handler", 'export const load = () => import("@/app/api/coach-quiz/route");'],
    ["dynamic import of the Anthropic SDK", 'export const load = () => import("@anthropic-ai/sdk");'],
    ["a route handler", 'import { POST } from "@/app/api/coach-quiz/route";\nexport const p = POST;'],
    ["a route handler, explicit extension", 'import { POST } from "@/app/api/coach-quiz/route.ts";\nexport const p = POST;'],
    ["the Anthropic SDK", 'import Anthropic from "@anthropic-ai/sdk";\nexport const a = Anthropic;'],
    ["an SDK subpath", 'export { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";'],
    ["process.env", "export const key = process.env.ANTHROPIC_API_KEY;"],
  ])("can't reach secrets from a client component: %s", async (_name, code) => {
    expect(await boundaryErrors(CLIENT, code)).toHaveLength(1);
  });

  it.each([
    ["a plain lib module, so nothing reaches .server through it", "src/lib/fixture.ts"],
    ["a page", "src/app/fixture/page.tsx"],
    ["a .js file", "src/lib/fixture.js"],
    ["a .jsx file", "src/components/Fixture.jsx"],
  ])("covers %s", async (_name, filePath) => {
    expect(await boundaryErrors(filePath, 'export { LLM_MODEL } from "@/lib/llm.server";')).toHaveLength(1);
  });

  it("still lets a client component import plain modules, canvas-session included", async () => {
    const code = 'import { loadCanvasToken } from "@/lib/canvas-session";\nimport type { CanvasCourse } from "@/lib/types";\nexport const a: CanvasCourse | string = loadCanvasToken();';
    const [result] = await eslint.lintText(code, { filePath: CLIENT });
    expect(result.messages.filter((m) => m.severity === 2)).toEqual([]);
  });
});

describe("code inside the server boundary", () => {
  it.each([
    ["a route handler", "src/app/api/fixture/route.ts"],
    ["another .server module", "src/lib/fixture.server.ts"],
  ])("%s may use server modules and secrets", async (_name, filePath) => {
    const code = 'import { LLM_MODEL } from "@/lib/llm.server";\nexport const m = [LLM_MODEL, process.env.ANTHROPIC_API_KEY];';
    expect(await boundaryErrors(filePath, code)).toEqual([]);
  });
});

describe("*.server files", () => {
  const files = globSync("src/**/*.server.{ts,tsx}", { cwd: APP_ROOT });

  it("exist, so the check below can't pass on an empty glob", () => {
    expect(files).not.toEqual([]);
  });

  it.each(files)('%s imports "server-only"', (file) => {
    expect(readFileSync(path.join(APP_ROOT, file), "utf8")).toMatch(/^import "server-only";?$/m);
  });
});
