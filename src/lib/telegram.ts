import { getGlobalSettings } from "./db";

export interface TelegramInlineKeyboardButton {
  text: string;
  url?: string;
  callback_data?: string;
}

export interface TelegramInlineKeyboardMarkup {
  inline_keyboard: TelegramInlineKeyboardButton[][];
}

export interface TelegramSendMessageOptions {
  parse_mode?: "HTML" | "Markdown";
  reply_markup?: TelegramInlineKeyboardMarkup;
  disable_web_page_preview?: boolean;
}

export interface TelegramApiResponse {
  ok: boolean;
  description?: string;
  result?: unknown;
}

export interface AlertTaskInfo {
  id: string;
  title: string;
  course: string;
  due: string;
  type: string;
  link?: string;
}

export interface ResolvedTelegramConfig {
  token: string;
  chatId: string;
  enabled: boolean;
}

export function getTelegramConfig(): ResolvedTelegramConfig {
  const envToken = process.env.TELEGRAM_BOT_TOKEN || "";
  const envChatId = process.env.TELEGRAM_CHAT_ID || "";
  const settings = getGlobalSettings();

  const token = (settings.telegramBotToken || envToken).trim();
  const chatId = (settings.telegramChatId || envChatId).trim();
  const enabled = Boolean(settings.telegramAlertsEnabled ?? true);

  return {
    token,
    chatId,
    enabled: enabled && token.length > 0 && chatId.length > 0,
  } satisfies ResolvedTelegramConfig;
}

export interface TelegramSendMessagePayload {
  chat_id: string;
  text: string;
  parse_mode?: "HTML" | "Markdown";
  reply_markup?: TelegramInlineKeyboardMarkup;
  disable_web_page_preview?: boolean;
}

export async function sendTelegramMessage(
  token: string,
  chatId: string,
  text: string,
  options?: TelegramSendMessageOptions
): Promise<TelegramApiResponse> {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const payload: TelegramSendMessagePayload = {
    chat_id: chatId,
    text,
    parse_mode: options?.parse_mode ?? "HTML",
    disable_web_page_preview: options?.disable_web_page_preview ?? true,
  };

  if (options?.reply_markup) {
    payload.reply_markup = options.reply_markup;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  // SAFETY: Standard Telegram Bot API JSON response structure
  const data = (await res.json()) as TelegramApiResponse;

  return data;
}

export async function answerCallbackQuery(
  token: string,
  callbackQueryId: string,
  text?: string
): Promise<boolean> {
  const url = `https://api.telegram.org/bot${token}/answerCallbackQuery`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text ?? "Berhasil diperbarui!",
        show_alert: false,
      }),
    });

    return res.ok;
  } catch {
    return false;
  }
}

export async function editMessageText(
  token: string,
  chatId: string | number,
  messageId: number,
  text: string,
  replyMarkup?: TelegramInlineKeyboardMarkup
): Promise<boolean> {
  const url = `https://api.telegram.org/bot${token}/editMessageText`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: "HTML",
        reply_markup: replyMarkup,
      }),
    });

    return res.ok;
  } catch {
    return false;
  }
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendTaskAlert(
  token: string,
  chatId: string,
  task: AlertTaskInfo,
  level: "24h" | "3h"
): Promise<boolean> {
  const d = new Date(task.due);
  const timeStr = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  const dateStr = d.toLocaleDateString("id-ID", { day: "numeric", month: "short", weekday: "short" });

  const headerTitle =
    level === "3h"
      ? "🚨 <b>PERINGATAN KRITIS: Tenggat Kurang 3 Jam!</b>"
      : "⚠️ <b>PENGINGAT: Tenggat Kurang 24 Jam!</b>";

  const message = [
    headerTitle,
    "",
    `📌 <b>${escapeHtml(task.title)}</b>`,
    `📚 Mata Kuliah: <code>${escapeHtml(task.course)}</code>`,
    `🏷️ Tipe: <b>${escapeHtml(task.type.toUpperCase())}</b>`,
    `⏰ Batas Waktu: <b>${dateStr}, pukul ${timeStr} WIB</b>`,
  ].join("\n");

  const inlineKeyboard: TelegramInlineKeyboardButton[][] = [];

  const rowButtons: TelegramInlineKeyboardButton[] = [
    {
      text: "✅ Tandai Selesai",
      callback_data: `done:${task.id}`,
    },
  ];

  if (task.link && task.link.startsWith("http")) {
    rowButtons.push({
      text: "🔗 Buka LMS",
      url: task.link,
    });
  }

  inlineKeyboard.push(rowButtons);

  const res = await sendTelegramMessage(token, chatId, message, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: inlineKeyboard,
    },
  });

  return res.ok;
}

export function formatMorningBriefing(
  todayTasks: AlertTaskInfo[],
  overdueTasks: AlertTaskInfo[]
): string {
  const lines: string[] = ["☀️ <b>Selamat Pagi! Agenda Tenggat Kuliah Hari Ini:</b>", ""];

  if (todayTasks.length === 0) {
    lines.push("🎉 <i>Tidak ada tenggat tugas baru untuk hari ini. Waktunya belajar santai!</i>");
  } else {
    lines.push(`📋 <b>Ada ${todayTasks.length} tugas yang harus dikumpulkan hari ini:</b>`);

    todayTasks.forEach((t, idx) => {
      const timeStr = new Date(t.due).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
      lines.push(`${idx + 1}. <b>${escapeHtml(t.title)}</b> (${escapeHtml(t.course)}) - ⏰ <code>${timeStr} WIB</code>`);
    });
  }

  if (overdueTasks.length > 0) {
    lines.push("");
    lines.push(`⚠️ <b>Perhatian: Ada ${overdueTasks.length} tugas tertinggal yang belum dicentang!</b>`);
    lines.push("Ketik <code>/tertinggal</code> untuk melihat daftarnya.");
  }

  lines.push("");
  lines.push("💡 Ketik <code>/tugas</code> untuk melihat semua tenggat mendatang.");

  return lines.join("\n");
}

export interface TelegramWebhookInfo {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
  max_connections?: number;
}

export async function setTelegramWebhook(
  token: string,
  url: string
): Promise<{ ok: boolean; description?: string }> {
  const apiUrl = `https://api.telegram.org/bot${token}/setWebhook`;

  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        allowed_updates: ["message", "callback_query"],
      }),
    });

    // SAFETY: Telegram API JSON response format
    const data = (await res.json()) as { ok: boolean; description?: string };

    return data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    return { ok: false, description: msg };
  }
}

export async function getTelegramWebhookInfo(
  token: string
): Promise<{ ok: boolean; result?: TelegramWebhookInfo; description?: string }> {
  const apiUrl = `https://api.telegram.org/bot${token}/getWebhookInfo`;

  try {
    const res = await fetch(apiUrl);

    // SAFETY: Telegram API JSON response format
    const data = (await res.json()) as {
      ok: boolean;
      result?: TelegramWebhookInfo;
      description?: string;
    };

    return data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    return { ok: false, description: msg };
  }
}

export async function deleteTelegramWebhook(
  token: string
): Promise<{ ok: boolean; description?: string }> {
  const apiUrl = `https://api.telegram.org/bot${token}/deleteWebhook`;

  try {
    const res = await fetch(apiUrl, { method: "POST" });

    // SAFETY: Telegram API JSON response format
    const data = (await res.json()) as { ok: boolean; description?: string };

    return data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    return { ok: false, description: msg };
  }
}
