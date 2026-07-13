import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { createAdminClient } from "../supabase/admin";

const MAX_CLOCK_SKEW_SECONDS = 5 * 60;

export interface AutomationSignatureInput {
  secret: string;
  method: string;
  pathname: string;
  timestamp: string;
  body: string;
}

export function bodyHash(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

export function signaturePayload(input: Omit<AutomationSignatureInput, "secret">): string {
  return [
    input.method.toUpperCase(),
    input.pathname,
    input.timestamp,
    bodyHash(input.body),
  ].join("\n");
}

export function createAutomationSignature(input: AutomationSignatureInput): string {
  return createHmac("sha256", input.secret)
    .update(signaturePayload(input))
    .digest("hex");
}

export function automationSignaturesMatch(
  input: AutomationSignatureInput,
  suppliedSignature: string
): boolean {
  if (!/^[a-f0-9]{64}$/.test(suppliedSignature)) return false;
  const expected = Buffer.from(createAutomationSignature(input), "hex");
  const supplied = Buffer.from(suppliedSignature, "hex");
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

function readKeys(): Record<string, string> {
  const json = process.env.MUIN_AUTOMATION_HMAC_KEYS;
  if (json) {
    try {
      const parsed = JSON.parse(json) as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(parsed).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string"
        )
      );
    } catch {
      return {};
    }
  }
  const keyId = process.env.MUIN_AUTOMATION_HMAC_KEY_ID;
  const secret = process.env.MUIN_AUTOMATION_HMAC_SECRET;
  return keyId && secret ? { [keyId]: secret } : {};
}

export async function verifyAutomationRequest(
  request: Request,
  rawBody: string
): Promise<{ ok: true; keyId: string } | { ok: false; status: number; error: string }> {
  const keyId = request.headers.get("x-muin-key-id") ?? "";
  const timestamp = request.headers.get("x-muin-timestamp") ?? "";
  const suppliedBodyHash = request.headers.get("x-muin-body-sha256") ?? "";
  const suppliedSignature = request.headers.get("x-muin-signature") ?? "";
  const secret = readKeys()[keyId];
  if (!secret || !/^\d{10}$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(suppliedSignature)) {
    return { ok: false, status: 401, error: "Invalid automation authentication" };
  }
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (age > MAX_CLOCK_SKEW_SECONDS) {
    return { ok: false, status: 401, error: "Automation timestamp expired" };
  }
  const actualBodyHash = bodyHash(rawBody);
  if (suppliedBodyHash !== actualBodyHash) {
    return { ok: false, status: 401, error: "Automation body hash mismatch" };
  }
  const signatureInput = {
    secret,
    method: request.method,
    pathname: new URL(request.url).pathname,
    timestamp,
    body: rawBody,
  };
  if (!automationSignaturesMatch(signatureInput, suppliedSignature)) {
    return { ok: false, status: 401, error: "Invalid automation signature" };
  }

  const replayHash = createHash("sha256")
    .update(`${keyId}:${suppliedSignature}`)
    .digest("hex");
  const supabase = createAdminClient();
  const { error } = await supabase.from("automation_hmac_replays").insert({
    signature_hash: replayHash,
    key_id: keyId,
    expires_at: new Date(Date.now() + MAX_CLOCK_SKEW_SECONDS * 1_000).toISOString(),
  });
  if (error) {
    return { ok: false, status: 409, error: "Automation request replayed" };
  }
  void supabase
    .from("automation_hmac_replays")
    .delete()
    .lt("expires_at", new Date().toISOString());
  return { ok: true, keyId };
}
