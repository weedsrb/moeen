import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { TelegramProvider } from "@/lib/messaging/telegram";
import { connectTelegramSchema } from "@/lib/validations/telegram";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: merchant } = await supabase
    .from("merchants")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!merchant) {
    return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = connectTelegramSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  try {
    // Verify the bot token is valid
    const botInfo = await TelegramProvider.verifyToken(parsed.data.botToken);

    // Generate a webhook secret for verification
    const webhookSecret = crypto.randomUUID();

    // Set up the webhook URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      return NextResponse.json(
        { error: "App URL not configured" },
        { status: 500 }
      );
    }

    const webhookUrl = `${appUrl}/api/webhooks/telegram/${merchant.id}`;
    await TelegramProvider.setWebhook(
      parsed.data.botToken,
      webhookUrl,
      webhookSecret
    );

    // Save to merchant_settings
    const { error } = await supabase
      .from("merchant_settings")
      .update({
        telegram_bot_token: parsed.data.botToken,
        telegram_connected: true,
        telegram_bot_username: botInfo.username,
        telegram_webhook_secret: webhookSecret,
      })
      .eq("merchant_id", merchant.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      botUsername: botInfo.username,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to connect Telegram bot";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: merchant } = await supabase
    .from("merchants")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!merchant) {
    return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
  }

  // Fetch current token
  const { data: settings } = await supabase
    .from("merchant_settings")
    .select("telegram_bot_token")
    .eq("merchant_id", merchant.id)
    .single();

  if (settings?.telegram_bot_token) {
    try {
      await TelegramProvider.deleteWebhook(settings.telegram_bot_token);
    } catch {
      // Ignore errors — token may already be invalid
    }
  }

  const { error } = await supabase
    .from("merchant_settings")
    .update({
      telegram_bot_token: null,
      telegram_connected: false,
      telegram_bot_username: null,
      telegram_webhook_secret: null,
    })
    .eq("merchant_id", merchant.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
