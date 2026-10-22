import { NextRequest, NextResponse } from "next/server";
import {
  getGlobalSettings,
  getSessionUser,
  updateGlobalSettings,
  updateUserTelegram,
  GlobalSettings,
} from "@/lib/db";

interface TelegramSettingsRequestBody {
  token?: string;
  chatId?: string;
  enabled?: boolean;
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get("session_token")?.value;
  const user = token ? getSessionUser(token) : null;

  return NextResponse.json({
    ok: true,
    token: user ? (user.telegramBotToken || "") : "",
    chatId: user ? (user.telegramChatId || "") : "",
    enabled: user ? Boolean(user.telegramAlertsEnabled) : false,
  });
}

export async function PATCH(req: NextRequest) {
  try {
    // SAFETY: Request body parsed with type interface below
    const body = (await req.json().catch(() => ({}))) as TelegramSettingsRequestBody;

    const token = body.token !== undefined ? String(body.token).trim() : undefined;
    const chatId = body.chatId !== undefined ? String(body.chatId).trim() : undefined;
    const enabled = body.enabled !== undefined ? Boolean(body.enabled) : undefined;

    const sessionCookie = req.cookies.get("session_token")?.value;
    const user = sessionCookie ? getSessionUser(sessionCookie) : null;

    if (user) {
      updateUserTelegram(user.id, token, chatId, enabled);

      return NextResponse.json({
        ok: true,
        token: token ?? user.telegramBotToken ?? "",
        chatId: chatId ?? user.telegramChatId ?? "",
        enabled: enabled ?? user.telegramAlertsEnabled ?? true,
      });
    }

    const globalUpdates: Partial<GlobalSettings> = {};

    if (token !== undefined) {
      globalUpdates.telegramBotToken = token;
    }

    if (chatId !== undefined) {
      globalUpdates.telegramChatId = chatId;
    }

    if (enabled !== undefined) {
      globalUpdates.telegramAlertsEnabled = enabled;
    }

    updateGlobalSettings(globalUpdates);

    const settings = getGlobalSettings();

    return NextResponse.json({
      ok: true,
      token: settings.telegramBotToken ?? "",
      chatId: settings.telegramChatId ?? "",
      enabled: settings.telegramAlertsEnabled ?? true,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    return NextResponse.json(
      {
        ok: false,
        error: `Gagal memperbarui pengaturan Telegram: ${message}`,
      },
      { status: 500 }
    );
  }
}
