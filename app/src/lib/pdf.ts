// PDF text extraction (server side, used by /api/pdf-text and the tests).
// unpdf bundles a serverless build of PDF.js, so it runs on Vercel functions
// without native dependencies.

import { extractText, getDocumentProxy } from "unpdf";

export async function extractPdfText(data: Uint8Array): Promise<{ text: string; pages: number }> {
  const pdf = await getDocumentProxy(data);
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  return { text, pages: totalPages };
}
