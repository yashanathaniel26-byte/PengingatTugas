import { NextRequest, NextResponse } from "next/server";
import { getTelegramConfig, sendTelegramMessage } from "@/lib/telegram";
import { updateGlobalSettings } from "@/lib/db";

interface TestTelegramRequestBody {
  token?: string;
  chatId?: string;
}

export async function POST(req: NextRequest) {
  try {
    // SAFETY: Request body parsed with type interface below
    const body = (await req.json().catch(() => ({}))) as TestTelegramRequestBody;

    const config = getTelegramConfig();
    const token = String(body.token ?? config.token).trim();
    const chatId = String(body.chatId ?? config.chatId).trim();

    if (!token || !chatId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Bot Token dan Chat ID wajib diisi untuk menguji pengiriman pesan.",
        },
        { status: 400 }
      );
    }

    const testMessage = [
      "🚀 <b>Koneksi Telegram Berhasil!</b>",
      "",
      "Aplikasi <b>Tenggat Kuliah</b> Anda kini terhubung ke Telegram ini.",
      "Anda akan menerima pengingat deadline otomatis (H-24 jam dan H-3 jam) serta agenda harian di sini.",
      "",
      "💡 <i>Ketik /tugas untuk melihat daftar tugas yang sedang aktif.</i>",
    ].join("\n");

    const result = await sendTelegramMessage(token, chatId, testMessage, {
      parse_mode: "HTML",
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.description || "Telegram menolak permintaan pengiriman pesan.",
        },
        { status: 400 }
      );
    }

    // Persist working credentials to database settings
    updateGlobalSettings({
      telegramBotToken: token,
      telegramChatId: chatId,
      telegramAlertsEnabled: true,
    });

    return NextResponse.json({
      ok: true,
      message: "Pesan uji coba berhasil terkirim ke Telegram Anda!",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    return NextResponse.json(
      {
        ok: false,
        error: `Gagal mengirim pesan: ${message}`,
      },
      { status: 500 }
    );
  }
}
