import { EncryptJWT, jwtDecrypt } from "jose";
import { z } from "zod";

/**
 * What AMI's server keeps about a session, sealed (encrypted and
 * authenticated) into the `ami_session` cookie. Browser code never sees the
 * cookie, and nobody can read or change it without SESSION_SECRET.
 */
export interface ServerSession {
  refreshToken: string;
  workspace: string;
  kind: "staff" | "partner";
  partnerIds: string[];
  signedInAt: number;
  lastActiveAt: number;
}

const sessionSchema = z.object({
  refreshToken: z.string().min(1),
  workspace: z.string().min(1),
  kind: z.enum(["staff", "partner"]),
  partnerIds: z.array(z.string()),
  signedInAt: z.number(),
  lastActiveAt: z.number(),
});

export const SESSION_COOKIE = "ami_session";

function secretKey(): Uint8Array {
  const key = Buffer.from(process.env.SESSION_SECRET ?? "", "base64");
  if (key.length !== 32) {
    throw new Error("SESSION_SECRET must be 32 random bytes, base64: openssl rand -base64 32");
  }
  return new Uint8Array(key);
}

export async function sealSession(session: ServerSession): Promise<string> {
  return new EncryptJWT({ ...session })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .encrypt(secretKey());
}

/** The session in a cookie value, or null when it's missing, tampered with or sealed with another key. */
export async function openSession(value: string | undefined): Promise<ServerSession | null> {
  if (!value) return null;
  const key = secretKey();
  try {
    const { payload } = await jwtDecrypt(value, key);
    const parsed = sessionSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * The cookie has no Max-Age or Expires, so the browser drops it when it closes.
 * Secure everywhere but localhost, where Playwright runs a production build over
 * plain http and WebKit would drop a Secure cookie.
 */
export function sessionCookieOptions(requestUrl: URL): {
  httpOnly: true;
  secure: boolean;
  sameSite: "strict";
  path: "/";
} {
  const local = requestUrl.hostname === "localhost" || requestUrl.hostname === "127.0.0.1";
  return { httpOnly: true, secure: !local, sameSite: "strict", path: "/" };
}
