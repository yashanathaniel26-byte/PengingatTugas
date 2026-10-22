import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, updateUserIcalUrl } from "@/lib/db";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("session_token")?.value;

  if (!token) {
    return NextResponse.json({ user: null });
  }

  const user = getSessionUser(token);

  if (!user) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      icalUrl: user.icalUrl || "",
      telegramBotToken: user.telegramBotToken || "",
      telegramChatId: user.telegramChatId || "",
      telegramAlertsEnabled: user.telegramAlertsEnabled ?? true,
      whatsappToken: user.whatsappToken || "",
      whatsappTargetPhone: user.whatsappTargetPhone || "",
      whatsappAlertsEnabled: user.whatsappAlertsEnabled ?? true,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const token = req.cookies.get("session_token")?.value;

  if (!token) {
    return NextResponse.json({ error: "Sesi tidak ditemukan" }, { status: 401 });
  }

  const user = getSessionUser(token);

  if (!user) {
    return NextResponse.json({ error: "Sesi telah berakhir" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const icalUrl = String(body.icalUrl ?? "").trim();

    if (icalUrl) {
      updateUserIcalUrl(user.id, icalUrl);
    }

    return NextResponse.json({
      success: true,
      icalUrl,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    return NextResponse.json(
      { error: `Gagal memperbarui profil: ${message}` },
      { status: 500 }
    );
  }
}
