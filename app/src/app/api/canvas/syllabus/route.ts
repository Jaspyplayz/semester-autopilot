import { z } from "zod";
import { fetchCourseSyllabus } from "@/lib/canvas";
import { canvasRoute } from "@/lib/canvas-route";
import { extractPdfText } from "@/lib/pdf";

export const maxDuration = 60;

// Digits only: this goes into a path on the course site.
const BodySchema = z.object({ courseId: z.string().regex(/^\d{1,20}$/) });

export async function POST(request: Request) {
  return canvasRoute(request, BodySchema, (conn, { courseId }) =>
    fetchCourseSyllabus(conn, courseId, async (bytes) => (await extractPdfText(bytes)).text),
  );
}
