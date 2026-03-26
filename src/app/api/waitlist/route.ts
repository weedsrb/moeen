import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const waitlistSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = waitlistSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("waitlist")
    .upsert({ email: parsed.data.email }, { onConflict: "email" });

  if (error) {
    return NextResponse.json(
      { error: "Failed to join waitlist" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
