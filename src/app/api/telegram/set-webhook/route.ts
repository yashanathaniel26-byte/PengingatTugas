import { NextRequest, NextResponse } from "next/server";
import {
  getTelegramConfig,
  getTelegramWebhookInfo,
  setTelegramWebhook,
  deleteTelegramWebhook,
} from "@/lib/telegram";

interface SetWebhookRequestBody {
  webhookUrl?: string;
}

export async function GET() {
  const config = getTelegramConfig();

  if (!config.token) {
    return NextResponse.json(
      { ok: false, error: "Bot token belum dikonfigurasi." },
      { status: 400 }
    );
  }

  const result = await getTelegramWebhookInfo(config.token);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.description || "Gagal mengambil info webhook Telegram." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    webhook: result.result,
  });
}

export async function POST(req: NextRequest) {
  const config = getTelegramConfig();

  if (!config.token) {
    return NextResponse.json(
      { ok: false, error: "Bot token belum dikonfigurasi di pengaturan." },
      { status: 400 }
    );
  }

  try {
    // SAFETY: Request body parsed with type interface
    const body = (await req.json().catch(() => ({}))) as SetWebhookRequestBody;

    let targetUrl = (body.webhookUrl || "").trim();

    // If no explicit URL provided, infer from request headers
    if (!targetUrl) {
      const proto = req.headers.get("x-forwarded-proto") || "https";
      const host = req.headers.get("x-forwarded-host") || req.headers.get("host");

      if (host) {
        targetUrl = `${proto}://${host}/api/telegram/webhook`;
      }
    }

    if (!targetUrl.startsWith("https://")) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Telegram mewajibkan URL Webhook menggunakan protokol HTTPS publik (contoh: https://domain-anda.vercel.app/api/telegram/webhook).",
        },
        { status: 400 }
      );
    }

    const res = await setTelegramWebhook(config.token, targetUrl);

    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: res.description || "Telegram menolak pendaftaran URL webhook.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Webhook berhasil didaftarkan ke: ${targetUrl}`,
      url: targetUrl,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    return NextResponse.json(
      { ok: false, error: `Gagal mengatur webhook: ${msg}` },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const config = getTelegramConfig();

  if (!config.token) {
    return NextResponse.json(
      { ok: false, error: "Bot token belum dikonfigurasi." },
      { status: 400 }
    );
  }

  const result = await deleteTelegramWebhook(config.token);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.description || "Gagal menghapus webhook Telegram." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Webhook berhasil dinonaktifkan dari Telegram.",
  });
}
