import { z } from "zod";
import { importLeads } from "@/lib/app/commands";
import { getRuntime } from "@/lib/app/runtime";
import { withCommand } from "@/lib/http/respond";

const schema = z.object({
  listId: z.string().optional(),
  listName: z.string().optional(),
  content: z.string().min(1),
  format: z.enum(["csv", "markdown", "auto"]).optional(),
});

export async function POST(req: Request) {
  return withCommand(async () => {
    const input = schema.parse(await req.json());
    return importLeads(await getRuntime(), input);
  });
}
