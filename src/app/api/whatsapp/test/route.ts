import { NextRequest, NextResponse } from "next/server";
import { getWhatsAppConfig, sendWhatsAppMessage } from "@/lib/whatsapp";
import { updateGlobalSettings } from "@/lib/db";

interface TestWhatsAppRequestBody {
  token?: string;
  targetPhone?: string;
}

export async function POST(req: NextRequest) {
  try {
    // SAFETY: Request body parsed with type interface below
    const body = (await req.json().catch(() => ({}))) as TestWhatsAppRequestBody;

    const config = getWhatsAppConfig();
    const token = String(body.token ?? config.token).trim();
    const targetPhone = String(body.targetPhone ?? config.targetPhone).trim();

    if (!token || !targetPhone) {
      return NextResponse.json(
        {
          ok: false,
          error: "Fonnte API Token dan Nomor WhatsApp Tujuan wajib diisi.",
        },
        { status: 400 }
      );
    }

    const testMessage = [
      "🚀 *Koneksi WhatsApp Berhasil!*",
      "",
      "Aplikasi *Tenggat Kuliah* Anda kini terhubung ke nomor WhatsApp ini via Fonnte Gateway.",
      "Anda akan menerima pengingat deadline otomatis (H-24 jam & H-3 jam) serta agenda harian di sini.",
      "",
      "📚 _Semangat kuliah dan jangan lupa cek tugas di dashboard!_",
    ].join("\n");

    const result = await sendWhatsAppMessage(targetPhone, testMessage, token);

    if (!result.status) {
      return NextResponse.json(
        {
          ok: false,
          error: result.reason || result.detail || "Fonnte menolak permintaan pengiriman pesan.",
        },
        { status: 400 }
      );
    }

    // Persist working credentials
    updateGlobalSettings({
      whatsappToken: token,
      whatsappTargetPhone: targetPhone,
      whatsappAlertsEnabled: true,
    });

    return NextResponse.json({
      ok: true,
      message: `Pesan uji coba berhasil terkirim ke WhatsApp ${targetPhone}!`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    return NextResponse.json(
      {
        ok: false,
        error: `Gagal mengirim pesan WhatsApp: ${message}`,
      },
      { status: 500 }
    );
  }
}
