import { NextRequest, NextResponse } from "next/server";
import {
  getTelegramConfig,
  sendTelegramMessage,
  answerCallbackQuery,
  editMessageText,
  escapeHtml,
  AlertTaskInfo,
  TelegramInlineKeyboardButton,
} from "@/lib/telegram";
import {
  addTask,
  getAllTasks,
  getGlobalSettings,
  markTaskDoneByTitleOrId,
  getAllNotes,
} from "@/lib/db";
import { parseIcs } from "@/app/api/deadlines/route";

interface TelegramChat {
  id: number | string;
  type: string;
}

interface TelegramUser {
  id: number;
  first_name: string;
  username?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  date: number;
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

// Helper to gather all incomplete tasks from LMS iCal + DB
async function getActiveTasksList(): Promise<{ upcoming: AlertTaskInfo[]; overdue: AlertTaskInfo[] }> {
  const settings = getGlobalSettings();
  const targetUrl = settings.icalUrl || process.env.ICAL_URL;
  const allTasks: AlertTaskInfo[] = [];

  if (targetUrl) {
    try {
      const res = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) PengingatTugas/1.0",
        },
        next: { revalidate: 300 },
      });

      if (res.ok) {
        const icsText = await res.text();
        const lmsEvents = parseIcs(icsText);

        lmsEvents.forEach((item) => {
          allTasks.push({
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
  }

  const manualTasks = getAllTasks();

  manualTasks.forEach((t) => {
    if (!t.done) {
      allTasks.push({
        id: t.id,
        title: t.title,
        course: t.course,
        due: t.due,
        type: t.type,
      });
    }
  });

  const now = Date.now();
  const upcoming: AlertTaskInfo[] = [];
  const overdue: AlertTaskInfo[] = [];

  allTasks.forEach((t) => {
    const dueMs = new Date(t.due).getTime();

    if (dueMs < now) {
      overdue.push(t);
    } else {
      upcoming.push(t);
    }
  });

  upcoming.sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());
  overdue.sort((a, b) => new Date(b.due).getTime() - new Date(a.due).getTime());

  return { upcoming, overdue };
}

export async function POST(req: NextRequest) {
  const config = getTelegramConfig();

  if (!config.token) {
    return NextResponse.json({ ok: false, error: "Bot token not configured" }, { status: 400 });
  }

  try {
    // SAFETY: Validated Telegram update structure through interface guards below
    const update = (await req.json()) as TelegramUpdate;

    // 1. Handle Callback Query (Klik tombol [ ✅ Tandai Selesai ])
    if (update.callback_query) {
      const query = update.callback_query;
      const data = query.data || "";

      if (data.startsWith("done:")) {
        const taskId = data.substring(5);
        markTaskDoneByTitleOrId(taskId);

        await answerCallbackQuery(config.token, query.id, "✅ Tugas berhasil diselesaikan!");

        if (query.message) {
          const originalText = query.message.text || "";
          const updatedNotice = `${originalText}\n\n✅ <b>SELESAI</b> · Tugas telah dicentang dari Telegram.`;

          await editMessageText(
            config.token,
            query.message.chat.id,
            query.message.message_id,
            updatedNotice
          );
        }

        return NextResponse.json({ ok: true, handled: "callback_done" });
      }

      await answerCallbackQuery(config.token, query.id);

      return NextResponse.json({ ok: true, handled: "callback_other" });
    }

    // 2. Handle Text Messages
    const message = update.message;

    if (!message || !message.text) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const chatId = String(message.chat.id);
    const rawText = message.text.trim();
    const command = rawText.split(" ")[0].toLowerCase();

    // Command: /start
    if (command === "/start") {
      const welcomeText = [
        "👋 <b>Halo! Selamat datang di Bot Tenggat Kuliah Telkom University.</b>",
        "",
        "Bot ini terhubung ke dashboard pengingat tugas dan catatan kuliah Anda.",
        "",
        "📌 <b>Perintah yang dapat digunakan:</b>",
        "• <code>/tugas</code> — Lihat daftar tugas aktif & hitung mundur",
        "• <code>/tertinggal</code> — Lihat tugas yang lewat batas tenggat",
        "• <code>/catatan</code> — Lihat catatan kuliah & evaluasi",
        "• <code>/tambah Judul | Matkul | YYYY-MM-DD HH:mm</code> — Tambah tugas kilat",
        "• <code>/bantuan</code> — Panduan penggunaan bot",
      ].join("\n");

      await sendTelegramMessage(config.token, chatId, welcomeText, { parse_mode: "HTML" });

      return NextResponse.json({ ok: true });
    }

    // Command: /tugas
    if (command === "/tugas") {
      const { upcoming } = await getActiveTasksList();

      if (upcoming.length === 0) {
        await sendTelegramMessage(
          config.token,
          chatId,
          "🎉 <b>Tidak ada tugas aktif mendatang!</b> Semua tugas sudah beres atau belum ada tugas baru.",
          { parse_mode: "HTML" }
        );

        return NextResponse.json({ ok: true });
      }

      const lines: string[] = [
        `📋 <b>Daftar Tugas Mendatang (${upcoming.length} tugas):</b>`,
        "",
      ];

      const topTasks = upcoming.slice(0, 5);

      topTasks.forEach((t, i) => {
        const d = new Date(t.due);
        const dateStr = d.toLocaleDateString("id-ID", { day: "numeric", month: "short", weekday: "short" });
        const timeStr = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

        lines.push(`${i + 1}. <b>${escapeHtml(t.title)}</b>`);
        lines.push(`   📚 ${escapeHtml(t.course)}`);
        lines.push(`   ⏰ ${dateStr}, ${timeStr} WIB`);
        lines.push("");
      });

      if (upcoming.length > 5) {
        lines.push(`<i>...dan ${upcoming.length - 5} tugas lainnya dapat dicek di website.</i>`);
      }

      const buttons: TelegramInlineKeyboardButton[][] = [];

      // Add a quick complete button for the closest urgent task
      if (topTasks[0]) {
        buttons.push([
          {
            text: `✅ Selesaikan: ${topTasks[0].title.substring(0, 24)}...`,
            callback_data: `done:${topTasks[0].id}`,
          },
        ]);
      }

      await sendTelegramMessage(config.token, chatId, lines.join("\n"), {
        parse_mode: "HTML",
        reply_markup: buttons.length > 0 ? { inline_keyboard: buttons } : undefined,
      });

      return NextResponse.json({ ok: true });
    }

    // Command: /tertinggal
    if (command === "/tertinggal") {
      const { overdue } = await getActiveTasksList();

      if (overdue.length === 0) {
        await sendTelegramMessage(
          config.token,
          chatId,
          "🌟 <b>Luar biasa!</b> Tidak ada tugas tertinggal yang belum diselesaikan.",
          { parse_mode: "HTML" }
        );

        return NextResponse.json({ ok: true });
      }

      const lines: string[] = [
        `⚠️ <b>Daftar Tugas Tertinggal (${overdue.length} tugas belum dicentang):</b>`,
        "",
      ];

      const topOverdue = overdue.slice(0, 6);

      topOverdue.forEach((t, i) => {
        const d = new Date(t.due);
        const dateStr = d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });

        lines.push(`${i + 1}. <b>${escapeHtml(t.title)}</b> (${escapeHtml(t.course)}) — lewat sejak ${dateStr}`);
      });

      const buttons: TelegramInlineKeyboardButton[][] = [];

      if (topOverdue[0]) {
        buttons.push([
          {
            text: `✅ Selesaikan: ${topOverdue[0].title.substring(0, 24)}...`,
            callback_data: `done:${topOverdue[0].id}`,
          },
        ]);
      }

      await sendTelegramMessage(config.token, chatId, lines.join("\n"), {
        parse_mode: "HTML",
        reply_markup: buttons.length > 0 ? { inline_keyboard: buttons } : undefined,
      });

      return NextResponse.json({ ok: true });
    }

    // Command: /catatan
    if (command === "/catatan") {
      const notes = getAllNotes();

      if (notes.length === 0) {
        await sendTelegramMessage(
          config.token,
          chatId,
          "📝 Belum ada catatan yang tersimpan di website.",
          { parse_mode: "HTML" }
        );

        return NextResponse.json({ ok: true });
      }

      const lines: string[] = [
        `📝 <b>Catatan Tersimpan (${notes.length} catatan):</b>`,
        "",
      ];

      notes.slice(0, 5).forEach((n, i) => {
        lines.push(`${i + 1}. <b>${escapeHtml(n.title)}</b> [${escapeHtml(n.category.toUpperCase())}]`);

        if (n.course) {
          lines.push(`   📖 ${escapeHtml(n.course)}`);
        }

        const snippet = n.content.length > 80 ? `${n.content.substring(0, 80)}...` : n.content;
        lines.push(`   <i>"${escapeHtml(snippet)}"</i>`);
        lines.push("");
      });

      await sendTelegramMessage(config.token, chatId, lines.join("\n"), {
        parse_mode: "HTML",
      });

      return NextResponse.json({ ok: true });
    }

    // Command: /tambah
    if (command === "/tambah") {
      const rest = rawText.substring(7).trim();
      const parts = rest.split("|").map((p) => p.trim());

      if (parts.length < 2) {
        const errorUsage = [
          "⚠️ <b>Format perintah salah!</b>",
          "",
          "Gunakan format pemisah tanda garis tegak (<code>|</code>):",
          "<code>/tambah Judul Tugas | Nama Matkul | YYYY-MM-DD HH:mm</code>",
          "",
          "Contoh:",
          "<code>/tambah Tugas Latihan 1 | Pemrograman Web | 2026-10-25 23:59</code>",
        ].join("\n");

        await sendTelegramMessage(config.token, chatId, errorUsage, { parse_mode: "HTML" });

        return NextResponse.json({ ok: true });
      }

      const title = parts[0];
      const course = parts[1] || "Umum";
      const dueInput = parts[2] || "";

      let dueIso = new Date().toISOString();

      if (dueInput) {
        const parsedDate = new Date(dueInput);

        if (!isNaN(parsedDate.getTime())) {
          dueIso = parsedDate.toISOString();
        }
      }

      addTask({
        userId: "guest",
        title,
        course,
        type: "tugas",
        due: dueIso,
        done: false,
        isManual: true,
      });

      const confirmText = [
        "✅ <b>Tugas Berhasil Ditambahkan ke Website!</b>",
        "",
        `📌 <b>${escapeHtml(title)}</b>`,
        `📚 Mata Kuliah: ${escapeHtml(course)}`,
        `⏰ Tenggat: ${new Date(dueIso).toLocaleString("id-ID")}`,
      ].join("\n");

      await sendTelegramMessage(config.token, chatId, confirmText, { parse_mode: "HTML" });

      return NextResponse.json({ ok: true });
    }

    // Default / Bantuan
    const helpText = [
      "🤖 <b>Bantuan Perintah Bot Tenggat Kuliah:</b>",
      "",
      "• <code>/tugas</code> — Melihat tugas yang harus dikerjakan",
      "• <code>/tertinggal</code> — Melihat tugas yang lewat batas tenggat",
      "• <code>/catatan</code> — Melihat catatan kuliah & evaluasi",
      "• <code>/tambah Judul | Matkul | YYYY-MM-DD HH:mm</code> — Tambah tugas manual baru",
    ].join("\n");

    await sendTelegramMessage(config.token, chatId, helpText, { parse_mode: "HTML" });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
