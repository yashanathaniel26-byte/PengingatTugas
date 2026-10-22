import { NextRequest, NextResponse } from "next/server";
import {
  sendTaskAlert,
  formatMorningBriefing,
  sendTelegramMessage,
  AlertTaskInfo,
} from "@/lib/telegram";
import {
  sendWhatsAppTaskAlert,
  formatWhatsAppMorningBriefing,
  sendWhatsAppMessage,
} from "@/lib/whatsapp";
import {
  getAllUsers,
  getUserTasks,
  isUserAlertAlreadyNotified,
  markUserAlertNotified,
  isUserWhatsAppAlertAlreadyNotified,
  markUserWhatsAppAlertNotified,
  UserRecord,
} from "@/lib/db";
import { parseIcs, normalizeIcalUrl } from "@/app/api/deadlines/route";

interface CheckAlertsResult {
  ok: boolean;
  sentCount: number;
  alerts: string[];
  skipped?: boolean;
  reason?: string;
}

interface UserNotificationTarget {
  userId: string;
  username: string;
  icalUrl?: string;
  telegram?: {
    token: string;
    chatId: string;
    enabled: boolean;
  };
  whatsapp?: {
    token: string;
    targetPhone: string;
    enabled: boolean;
  };
}

async function fetchUserIcalTasks(icalUrl?: string): Promise<AlertTaskInfo[]> {
  if (!icalUrl) {
    return [];
  }

  const tasks: AlertTaskInfo[] = [];

  const targetUrl = normalizeIcalUrl(icalUrl);

  try {
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/calendar, text/plain, */*",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      next: { revalidate: 300 },
    });

    if (res.ok) {
      const icsText = await res.text();
      const lmsEvents = parseIcs(icsText);

      lmsEvents.forEach((item) => {
        tasks.push({
          id: item.id,
          title: item.title,
          course: item.course,
          due: item.due,
          type: item.type,
          link: item.link,
        });
      });
    }
  } catch {}

  return tasks;
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    const hasSession = Boolean(req.cookies.get("session_token")?.value);
    const isValidCron = authHeader === `Bearer ${cronSecret}`;

    if (!isValidCron && !hasSession) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized: Token otentikasi cron tidak valid." },
        { status: 401 }
      );
    }
  }

  const { searchParams } = new URL(req.url);
  const isMorning = searchParams.get("morning") === "true";
  const now = Date.now();

  const allUsers: UserRecord[] = getAllUsers();
  const targets: UserNotificationTarget[] = [];

  allUsers.forEach((u) => {
    const hasTg = Boolean(u.telegramAlertsEnabled && u.telegramBotToken && u.telegramChatId);
    const hasWa = Boolean(u.whatsappAlertsEnabled && u.whatsappToken && u.whatsappTargetPhone);

    if (hasTg || hasWa) {
      targets.push({
        userId: u.id,
        username: u.username,
        icalUrl: u.icalUrl,
        telegram: hasTg
          ? {
              token: (u.telegramBotToken || "").trim(),
              chatId: (u.telegramChatId || "").trim(),
              enabled: true,
            }
          : undefined,
        whatsapp: hasWa
          ? {
              token: (u.whatsappToken || "").trim(),
              targetPhone: (u.whatsappTargetPhone || "").trim(),
              enabled: true,
            }
          : undefined,
      });
    }
  });

  if (targets.length === 0) {
    return NextResponse.json({
      ok: true,
      sentCount: 0,
      alerts: [],
      skipped: true,
      reason: "Tidak ada akun pengguna yang mengaktifkan pengingat Telegram atau WhatsApp.",
    } satisfies CheckAlertsResult);
  }

  const sentAlerts: string[] = [];

  // Evaluate alerts per user account separately
  for (const target of targets) {
    const lmsTasks = await fetchUserIcalTasks(target.icalUrl);
    const manualTasks = getUserTasks(target.userId);

    const userTasks: AlertTaskInfo[] = [...lmsTasks];

    manualTasks.forEach((t) => {
      if (!t.done) {
        userTasks.push({
          id: t.id,
          title: t.title,
          course: t.course,
          due: t.due,
          type: t.type,
        });
      }
    });

    // 1. Morning Briefing
    if (isMorning) {
      const todayStr = new Date().toDateString();

      const todayTasks = userTasks.filter((t) => {
        const taskDate = new Date(t.due).toDateString();
        const taskMs = new Date(t.due).getTime();

        return taskDate === todayStr && taskMs > now;
      });

      const overdueTasks = userTasks.filter((t) => {
        const taskMs = new Date(t.due).getTime();

        return taskMs < now;
      });

      // Send to user's Telegram
      if (target.telegram?.enabled) {
        const briefingText = formatMorningBriefing(todayTasks, overdueTasks);

        await sendTelegramMessage(target.telegram.token, target.telegram.chatId, briefingText, {
          parse_mode: "HTML",
        });

        sentAlerts.push(`Telegram Morning Briefing [${target.username}]`);
      }

      // Send to user's WhatsApp
      if (target.whatsapp?.enabled) {
        const waBriefingText = formatWhatsAppMorningBriefing(todayTasks, overdueTasks);

        await sendWhatsAppMessage(
          target.whatsapp.targetPhone,
          waBriefingText,
          target.whatsapp.token
        );

        sentAlerts.push(`WhatsApp Morning Briefing [${target.username}]`);
      }
    }

    // 2. Critical Time Alerts (H-3 jam dan H-24 jam)
    for (const task of userTasks) {
      const dueMs = new Date(task.due).getTime();
      const diff = dueMs - now;

      if (diff <= 0) {
        continue;
      }

      // Urgensi kritis: sisa <= 3 jam
      if (diff <= 3 * 3600 * 1000) {
        // Telegram Alert for this user
        if (target.telegram?.enabled && !isUserAlertAlreadyNotified(target.userId, task.id, "3h")) {
          const sent = await sendTaskAlert(target.telegram.token, target.telegram.chatId, task, "3h");

          if (sent) {
            markUserAlertNotified(target.userId, task.id, "3h");
            sentAlerts.push(`Telegram Alert 3h [${target.username}]: ${task.title}`);
          }
        }

        // WhatsApp Alert for this user
        if (target.whatsapp?.enabled && !isUserWhatsAppAlertAlreadyNotified(target.userId, task.id, "3h")) {
          const sentWa = await sendWhatsAppTaskAlert(
            target.whatsapp.token,
            target.whatsapp.targetPhone,
            task,
            "3h"
          );

          if (sentWa) {
            markUserWhatsAppAlertNotified(target.userId, task.id, "3h");
            sentAlerts.push(`WhatsApp Alert 3h [${target.username}]: ${task.title}`);
          }
        }

        continue;
      }

      // Pengingat harian: sisa <= 24 jam
      if (diff <= 24 * 3600 * 1000) {
        // Telegram Alert for this user
        if (target.telegram?.enabled && !isUserAlertAlreadyNotified(target.userId, task.id, "24h")) {
          const sent = await sendTaskAlert(target.telegram.token, target.telegram.chatId, task, "24h");

          if (sent) {
            markUserAlertNotified(target.userId, task.id, "24h");
            sentAlerts.push(`Telegram Alert 24h [${target.username}]: ${task.title}`);
          }
        }

        // WhatsApp Alert for this user
        if (target.whatsapp?.enabled && !isUserWhatsAppAlertAlreadyNotified(target.userId, task.id, "24h")) {
          const sentWa = await sendWhatsAppTaskAlert(
            target.whatsapp.token,
            target.whatsapp.targetPhone,
            task,
            "24h"
          );

          if (sentWa) {
            markUserWhatsAppAlertNotified(target.userId, task.id, "24h");
            sentAlerts.push(`WhatsApp Alert 24h [${target.username}]: ${task.title}`);
          }
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    sentCount: sentAlerts.length,
    alerts: sentAlerts,
  } satisfies CheckAlertsResult);
}
