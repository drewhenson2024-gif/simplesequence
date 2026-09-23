import { z } from "zod";
import { removeLinkedInAccount } from "@/lib/app/commands";
import { getRuntime } from "@/lib/app/runtime";
import { withCommand } from "@/lib/http/respond";

const schema = z.object({
  senderId: z.string().min(1),
});

export async function POST(req: Request) {
  return withCommand(async () => removeLinkedInAccount(await getRuntime(), schema.parse(await req.json()).senderId));
}
