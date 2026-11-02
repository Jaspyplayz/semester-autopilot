import { extractPdfText } from "@/lib/pdf";

// Turns an uploaded PDF into text and forgets it: nothing is written to disk,
// a database or the logs. Vercel functions reject bodies over 4.5 MB.
const MAX_BYTES = 4 * 1024 * 1024;
const TOO_BIG = "That PDF is over 4 MB. Paste its text instead.";

const fail = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length")) > MAX_BYTES + 64 * 1024) {
    return fail(413, TOO_BIG);
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "Send the PDF as multipart form data in a field called \"file\".");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return fail(400, "No file received.");
  if (file.size > MAX_BYTES) return fail(413, TOO_BIG);

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
    return fail(400, "That file isn't a PDF.");
  }

  try {
    const { text, pages } = await extractPdfText(bytes);
    if (text.trim().length < 20) {
      return fail(422, "This PDF has no readable text (it may be a scan). Paste the text instead.");
    }
    return Response.json({ text, pages });
  } catch {
    return fail(422, "Couldn't read this PDF (it may be damaged or password protected). Paste the text instead.");
  }
}
