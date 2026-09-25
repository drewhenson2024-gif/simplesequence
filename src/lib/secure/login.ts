import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

export type LinkedInLogin = {
  username: string;
  password: string;
  totpSecret: string;
};

export function loginKeyPresent(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.LOGIN_SECRET_KEY);
}

function keyFrom(env: NodeJS.ProcessEnv): Buffer {
  const raw = env.LOGIN_SECRET_KEY;
  if (!raw) throw new Error("LOGIN_SECRET_KEY is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("LOGIN_SECRET_KEY must be 32 bytes, base64");
  return key;
}

export function sealLogin(login: LinkedInLogin, env: NodeJS.ProcessEnv = process.env): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(env), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(login), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), body.toString("base64")].join(".");
}

export function openLogin(sealed: string, env: NodeJS.ProcessEnv = process.env): LinkedInLogin {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("saved login is unreadable");
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(env), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const text = Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8");
  return JSON.parse(text) as LinkedInLogin;
}

export function normalizeTotpSecret(secret: string): string {
  return secret.replace(/[\s-]/g, "").replace(/=+$/, "").toUpperCase();
}

function base32Decode(secret: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = normalizeTotpSecret(secret);
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("the setup key has a character that is not in a LinkedIn setup key");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function totpCode(secret: string, at: Date = new Date(), digits = 6, stepSeconds = 30): string {
  const counter = Math.floor(at.getTime() / 1000 / stepSeconds);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 10 ** digits).padStart(digits, "0");
}
