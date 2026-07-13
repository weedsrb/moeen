import { NextResponse } from "next/server";
import { verifyAutomationRequest } from "./hmac";

export async function readAuthenticatedAutomationRequest(
  request: Request
): Promise<
  | { rawBody: string; body: unknown }
  | { error: NextResponse }
> {
  const rawBody = await request.text();
  const auth = await verifyAutomationRequest(request, rawBody);
  if (!auth.ok) {
    return {
      error: NextResponse.json(
        { error: auth.error },
        { status: auth.status }
      ),
    };
  }
  try {
    return { rawBody, body: rawBody ? JSON.parse(rawBody) : {} };
  } catch {
    return {
      error: NextResponse.json({ error: "Invalid JSON" }, { status: 400 }),
    };
  }
}
