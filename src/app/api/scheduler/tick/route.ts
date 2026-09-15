import { tick } from "@/lib/app/commands";
import { getRuntime } from "@/lib/app/runtime";
import { withCommand } from "@/lib/http/respond";

function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.VERCEL !== "1";
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

async function runTick() {
  return withCommand(async () => tick(await getRuntime()));
}

export async function GET(req: Request) {
  if (!authorize(req)) return unauthorized();
  return runTick();
}

export async function POST(req: Request) {
  if (!authorize(req)) return unauthorized();
  return runTick();
}
