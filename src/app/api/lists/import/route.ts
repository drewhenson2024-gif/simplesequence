import { z } from "zod";
import { importLeads } from "@/lib/app/commands";
import { getRuntime } from "@/lib/app/runtime";
import { withCommand } from "@/lib/http/respond";

const schema = z
  .object({
    listId: z.string().optional(),
    listName: z.string().optional(),
    content: z.string().optional(),
    urls: z.array(z.string()).optional(),
    format: z.enum(["csv", "markdown", "urls", "auto"]).optional(),
  })
  .refine((d) => Boolean(d.content?.trim()) || Boolean(d.urls?.some((u) => u.trim())), {
    message: "urls or content required",
  });

export async function POST(req: Request) {
  return withCommand(async () => {
    const input = schema.parse(await req.json());
    return importLeads(await getRuntime(), input);
  });
}
