import https from "node:https";
import { getGlobalSettings } from "./db";
import { AlertTaskInfo } from "./telegram";

export interface FonnteDeviceInfo {
  status: boolean;
  device?: string;
  device_status?: string;
  name?: string;
  package?: string;
  quota?: string | number;
  expired?: string;
  messages?: number;
  reason?: string;
}

export interface FonnteSendResponse {
  status: boolean;
  detail?: string;
  target?: string[];
  id?: (string | number)[];
  process?: string;
  reason?: string;
}

export interface ResolvedWhatsAppConfig {
  token: string;
  targetPhone: string;
  enabled: boolean;
}

const FONNTE_FALLBACK_IP = "103.52.212.50";
const FONNTE_HOSTNAME = "api.fonnte.com";

export function getWhatsAppConfig(): ResolvedWhatsAppConfig {
  const envToken = process.env.FONNTE_TOKEN || "r1D5UfhNuNSigZz1jWZE";
  const envPhone = process.env.WHATSAPP_TARGET_PHONE || "6281931905436";
  const settings = getGlobalSettings();

  const token = (settings.whatsappToken || envToken).trim();
  const targetPhone = (settings.whatsappTargetPhone || envPhone).trim();
  const enabled = Boolean(settings.whatsappAlertsEnabled ?? true);

  return {
    token,
    targetPhone,
    enabled: enabled && token.length > 0 && targetPhone.length > 0,
  };
}

// Resilient HTTPS caller that tries standard fetch first, and falls back to direct IP with SNI if DNS lookup fails
async function callFonnteApi<T>(path: string, postData?: string, token?: string): Promise<T> {
  const finalToken = (token || getWhatsAppConfig().token).trim();

  // 1. Try standard global fetch
  try {
    const res = await fetch(`https://${FONNTE_HOSTNAME}${path}`, {
      method: "POST",
      headers: {
        Authorization: finalToken,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: postData,
    });

    // SAFETY: Standard Fonnte API JSON response structure
    const json = (await res.json()) as T;

    return json;
  } catch {
    // 2. Fallback to direct IP request with SNI for systems where UDP DNS lookup fails
    return new Promise<T>((resolvePromise, rejectPromise) => {
      const payload = postData || "";

      const req = https.request(
        {
          host: FONNTE_FALLBACK_IP,
          port: 443,
          path,
          method: "POST",
          headers: {
            Host: FONNTE_HOSTNAME,
            Authorization: finalToken,
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": Buffer.byteLength(payload),
          },
          servername: FONNTE_HOSTNAME,
          timeout: 10000,
        },
        (res) => {
          let raw = "";

          res.on("data", (chunk: Buffer | string) => {
            raw += chunk;
          });

          res.on("end", () => {
            try {
              // SAFETY: Standard Fonnte API JSON response parsed with type interface
              const parsed = JSON.parse(raw) as T;

              resolvePromise(parsed);
            } catch (e: unknown) {
              rejectPromise(e);
            }
          });
        }
      );

      req.on("error", (err) => {
        rejectPromise(err);
      });

      req.on("timeout", () => {
        req.destroy();
        rejectPromise(new Error("Koneksi ke server Fonnte timeout."));
      });

      if (payload) {
        req.write(payload);
      }

      req.end();
    });
  }
}

export async function getFonnteDeviceInfo(token?: string): Promise<FonnteDeviceInfo> {
  try {
    const data = await callFonnteApi<FonnteDeviceInfo>("/device", "", token);

    return data;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    return {
      status: false,
      reason: message,
    };
  }
}

export async function sendWhatsAppMessage(
  targetPhone: string,
  message: string,
  token?: string
): Promise<FonnteSendResponse> {
  const postData = new URLSearchParams({
    target: targetPhone,
    message,
    countryCode: "62",
  }).toString();

  try {
    const data = await callFonnteApi<FonnteSendResponse>("/send", postData, token);

    return data;
  } catch (err: unknown) {
    const messageText = err instanceof Error ? err.message : String(err);

    return {
      status: false,
      reason: messageText,
    };
  }
}

export async function sendWhatsAppTaskAlert(
  token: string,
  targetPhone: string,
  task: AlertTaskInfo,
  level: "24h" | "3h"
): Promise<boolean> {
  const d = new Date(task.due);
  const timeStr = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  const dateStr = d.toLocaleDateString("id-ID", { day: "numeric", month: "short", weekday: "short" });

  const headerTitle =
    level === "3h"
      ? "🚨 *PERINGATAN KRITIS: TENGGAT KURANG 3 JAM!*"
      : "⚠️ *PENGINGAT: TENGGAT KURANG 24 JAM!*";

  const lines = [
    headerTitle,
    "",
    `📌 *${task.title}*`,
    `📚 Mata Kuliah: ${task.course}`,
    `🏷️ Tipe: ${task.type.toUpperCase()}`,
    `⏰ Batas Waktu: *${dateStr}, pukul ${timeStr} WIB*`,
  ];

  if (task.link && task.link.startsWith("http")) {
    lines.push(`🔗 Link LMS: ${task.link}`);
  }

  lines.push("");
  lines.push("⚡ _Notifikasi otomatis dari Dashboard Pengingat Tugas Kuliah_");

  const res = await sendWhatsAppMessage(targetPhone, lines.join("\n"), token);

  return res.status;
}

export function formatWhatsAppMorningBriefing(
  todayTasks: AlertTaskInfo[],
  overdueTasks: AlertTaskInfo[]
): string {
  const lines: string[] = ["☀️ *Selamat Pagi! Agenda Tenggat Kuliah Hari Ini:*", ""];

  if (todayTasks.length === 0) {
    lines.push("🎉 _Tidak ada tenggat tugas baru untuk hari ini. Waktunya belajar santai!_");
  } else {
    lines.push(`📋 *Ada ${todayTasks.length} tugas yang harus dikumpulkan hari ini:*`);

    todayTasks.forEach((t, idx) => {
      const timeStr = new Date(t.due).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
      lines.push(`${idx + 1}. *${t.title}* (${t.course}) - ⏰ ${timeStr} WIB`);
    });
  }

  if (overdueTasks.length > 0) {
    lines.push("");
    lines.push(`⚠️ *Perhatian: Ada ${overdueTasks.length} tugas tertinggal yang belum dicentang!*`);
    overdueTasks.slice(0, 5).forEach((t, idx) => {
      lines.push(`   ${idx + 1}) ${t.title} (${t.course})`);
    });
  }

  lines.push("");
  lines.push("💡 _Buka website Tenggat Kuliah untuk mencentang tugas yang sudah selesai._");

  return lines.join("\n");
}
