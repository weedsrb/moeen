import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (process.env.LIGHTHOUSE_BYPASS_ENABLED !== "true") {
    return new NextResponse("Not found", { status: 404 });
  }

  const email = process.env.LIGHTHOUSE_TEST_EMAIL;
  const password = process.env.LIGHTHOUSE_TEST_PASSWORD;
  if (!email || !password) {
    return NextResponse.json(
      { error: "LIGHTHOUSE_TEST_EMAIL and LIGHTHOUSE_TEST_PASSWORD must be set" },
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  const nextParam = url.searchParams.get("next") ?? "/dashboard";
  const next =
    nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/dashboard";

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  return NextResponse.redirect(new URL(next, url.origin), { status: 302 });
}
