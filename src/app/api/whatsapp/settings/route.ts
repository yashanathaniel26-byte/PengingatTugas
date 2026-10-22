import { NextRequest, NextResponse } from "next/server";
import { getFonnteDeviceInfo } from "@/lib/whatsapp";
import {
  getGlobalSettings,
  getSessionUser,
  updateGlobalSettings,
  updateUserWhatsApp,
  GlobalSettings,
} from "@/lib/db";

interface WhatsAppSettingsRequestBody {
  token?: string;
  targetPhone?: string;
  enabled?: boolean;
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get("session_token")?.value;
  const user = token ? getSessionUser(token) : null;

  const activeToken = user ? (user.whatsappToken || "") : "";
  const targetPhone = user ? (user.whatsappTargetPhone || "") : "";
  const enabled = user ? Boolean(user.whatsappAlertsEnabled) : false;

  let device = null;

  if (activeToken) {
    device = await getFonnteDeviceInfo(activeToken);
  }

  return NextResponse.json({
    ok: true,
    token: activeToken,
    targetPhone,
    enabled,
    device,
  });
}

export async function PATCH(req: NextRequest) {
  try {
    // SAFETY: Request body parsed with type interface below
    const body = (await req.json().catch(() => ({}))) as WhatsAppSettingsRequestBody;

    const token = body.token !== undefined ? String(body.token).trim() : undefined;
    const targetPhone = body.targetPhone !== undefined ? String(body.targetPhone).trim() : undefined;
    const enabled = body.enabled !== undefined ? Boolean(body.enabled) : undefined;

    const sessionCookie = req.cookies.get("session_token")?.value;
    const user = sessionCookie ? getSessionUser(sessionCookie) : null;

    if (user) {
      updateUserWhatsApp(user.id, token, targetPhone, enabled);

      let device = null;

      if (token) {
        device = await getFonnteDeviceInfo(token);
      }

      return NextResponse.json({
        ok: true,
        token: token ?? user.whatsappToken ?? "",
        targetPhone: targetPhone ?? user.whatsappTargetPhone ?? "",
        enabled: enabled ?? user.whatsappAlertsEnabled ?? true,
        device,
      });
    }

    const globalUpdates: Partial<GlobalSettings> = {};

    if (token !== undefined) {
      globalUpdates.whatsappToken = token;
    }

    if (targetPhone !== undefined) {
      globalUpdates.whatsappTargetPhone = targetPhone;
    }

    if (enabled !== undefined) {
      globalUpdates.whatsappAlertsEnabled = enabled;
    }

    updateGlobalSettings(globalUpdates);

    const settings = getGlobalSettings();

    let device = null;

    if (settings.whatsappToken) {
      device = await getFonnteDeviceInfo(settings.whatsappToken);
    }

    return NextResponse.json({
      ok: true,
      token: settings.whatsappToken ?? "",
      targetPhone: settings.whatsappTargetPhone ?? "",
      enabled: settings.whatsappAlertsEnabled ?? true,
      device,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    return NextResponse.json(
      {
        ok: false,
        error: `Gagal memperbarui pengaturan WhatsApp: ${message}`,
      },
      { status: 500 }
    );
  }
}
