import { z } from "zod";
import { listCourses } from "@/lib/canvas";
import { canvasRoute } from "@/lib/canvas-route";

export const maxDuration = 60;

export async function POST(request: Request) {
  return canvasRoute(request, z.object({}), async (conn) => ({
    baseUrl: conn.baseUrl,
    courses: await listCourses(conn),
  }));
}
