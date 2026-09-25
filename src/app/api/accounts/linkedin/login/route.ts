import { z } from "zod";
import { linkedInLoginCode, removeLinkedInLogin, saveLinkedInLogin } from "@/lib/app/commands";
import { getRuntime } from "@/lib/app/runtime";
import { withCommand } from "@/lib/http/respond";

const saveSchema = z.object({
  senderId: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  totpSecret: z.string().min(1),
});

const senderSchema = z.object({ senderId: z.string().min(1) });

export async function POST(req: Request) {
  return withCommand(async () => {
    const input = saveSchema.parse(await req.json());
    return saveLinkedInLogin(await getRuntime(), input.senderId, input);
  });
}

export async function GET(req: Request) {
  return withCommand(async () => {
    const senderId = new URL(req.url).searchParams.get("senderId") ?? "";
    return linkedInLoginCode(await getRuntime(), senderSchema.parse({ senderId }).senderId);
  });
}

export async function DELETE(req: Request) {
  return withCommand(async () => {
    const input = senderSchema.parse(await req.json());
    return removeLinkedInLogin(await getRuntime(), input.senderId);
  });
}
