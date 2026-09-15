import { ZodError } from "zod";
import { CommandError } from "../app/commands";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export async function withCommand<T>(fn: () => Promise<T>): Promise<Response> {
  try {
    return json(await fn());
  } catch (err) {
    if (err instanceof CommandError) {
      return json({ error: err.message }, err.status);
    }
    if (err instanceof ZodError) {
      return json({ error: err.issues[0]?.message ?? "invalid_input" }, 400);
    }
    console.error(err);
    return json({ error: "internal_error" }, 500);
  }
}
