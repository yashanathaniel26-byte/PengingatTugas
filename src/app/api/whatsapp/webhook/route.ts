import { NextRequest, NextResponse } from "next/server";
import { getAllUsers, getUserTasks, addTask, markTaskDoneByTitleOrId, getGlobalSettings } from "@/lib/db";
import { parseIcs, normalizeIcalUrl } from "@/app/api/deadlines/route";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { AlertTaskInfo } from "@/lib/telegram";

interface FonnteWebhookPayload {
  sender?: string;
  message?: string;
  name?: string;
  device?: string;
}

// Normalize phone number for matching
function normalizePhone(p: string): string {
  const clean = p.replace(/\D/g, "");

  if (clean.startsWith("0")) {
    return "62" + clean.substring(1);
  }

  return clean;
}

// Helper to gather active tasks for a specific user
async function getUserActiveTasks(userId: string, icalUrl?: string): Promise<{ upcoming: AlertTaskInfo[]; overdue: AlertTaskInfo[] }> {
  const allTasks: AlertTaskInfo[] = [];

  // 1. Fetch from user's iCal or global iCal
  const settings = getGlobalSettings();
  const targetUrl = icalUrl || settings.icalUrl || process.env.ICAL_URL;

  if (targetUrl) {
    try {
      const fetchUrl = normalizeIcalUrl(targetUrl);

      const res = await fetch(fetchUrl, {
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
    } catch {
      // Ignore iCal fetch failures gracefully
    }
  }

  // 2. Fetch manual tasks for this user
  const manualTasks = getUserTasks(userId);
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
  let sender = "";
  let message = "";
  let senderName = "";

  const contentType = req.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      // SAFETY: Validated standard JSON webhook payload from Fonnte
      const body = (await req.json()) as FonnteWebhookPayload;
      sender = String(body.sender || "").trim();
      message = String(body.message || "").trim();
      senderName = String(body.name || "").trim();
    } else {
      const formData = await req.formData();
      sender = String(formData.get("sender") || "").trim();
      message = String(formData.get("message") || "").trim();
      senderName = String(formData.get("name") || "").trim();
    }
  } catch {
    return NextResponse.json({ status: false, error: "Invalid webhook payload" }, { status: 400 });
  }

  if (!sender || !message) {
    return NextResponse.json({ status: true, message: "Ignored empty sender/message" });
  }

  const normalizedSender = normalizePhone(sender);
  const users = getAllUsers();

  // Find user by WhatsApp phone, or fallback to first user (e.g. yasir)
  let user = users.find(
    (u) => u.whatsappTargetPhone && normalizePhone(u.whatsappTargetPhone) === normalizedSender
  );

  if (!user && users.length > 0) {
    user = users.find((u) => u.username === "yasir") || users[0];
  }

  if (!user) {
    return NextResponse.json({
      reply: "Akun belum terdaftar di sistem pengingat tugas.",
    });
  }

  const cleanMsg = message.toLowerCase().trim();
  let replyText = "";

  // 1. Command: Tanya Tugas (tugas / cek tugas / list)
  if (
    cleanMsg === "tugas" ||
    cleanMsg === "/tugas" ||
    cleanMsg.includes("cek tugas") ||
    cleanMsg.includes("tanya tugas") ||
    cleanMsg.includes("apa tugas")
  ) {
    const { upcoming } = await getUserActiveTasks(user.id, user.icalUrl);

    if (upcoming.length === 0) {
      replyText = `🎉 *Tidak ada tugas aktif mendatang!* Semua tugas Anda sudah beres atau belum ada tenggat baru.`;
    } else {
      const lines: string[] = [
        `📋 *Daftar Tugas Mendatang (${upcoming.length} tugas)*`,
        `👤 Akun: *${user.username}*`,
        "",
      ];

      const topTasks = upcoming.slice(0, 5);
      topTasks.forEach((t, i) => {
        const d = new Date(t.due);

        const dateStr = d.toLocaleDateString("id-ID", {
          day: "numeric",
          month: "short",
          weekday: "short",
        });

        const timeStr = d.toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
        });

        // Time remaining calculation
        const diffMs = d.getTime() - Date.now();
        const diffHours = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
        const diffDays = Math.floor(diffHours / 24);

        const remStr =
          diffDays > 0
            ? `${diffDays} hari lagi`
            : `${diffHours} jam lagi`;

        lines.push(`${i + 1}. *${t.title}*`);
        lines.push(`   📚 Matkul: ${t.course}`);
        lines.push(`   ⏰ Tenggat: ${dateStr}, ${timeStr} WIB (${remStr})`);
        lines.push("");
      });

      if (upcoming.length > 5) {
        lines.push(`_...dan ${upcoming.length - 5} tugas lainnya dapat dicek di website._`);
        lines.push("");
      }

      lines.push("💡 Ketik *selesai [nama tugas]* jika sudah menyelesaikan tugas.");
      replyText = lines.join("\n");
    }
  }
  // 2. Command: Tugas Tertinggal
  else if (cleanMsg === "tertinggal" || cleanMsg === "/tertinggal" || cleanMsg.includes("tugas tertinggal")) {
    const { overdue } = await getUserActiveTasks(user.id, user.icalUrl);

    if (overdue.length === 0) {
      replyText = `🌟 *Luar biasa!* Tidak ada tugas tertinggal yang belum diselesaikan.`;
    } else {
      const lines: string[] = [
        `⚠️ *Tugas Lewat Tenggat (${overdue.length} tugas)*`,
        "",
      ];

      overdue.slice(0, 5).forEach((t, i) => {
        const d = new Date(t.due);
        const dateStr = d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
        lines.push(`${i + 1}. *${t.title}* (${t.course})`);
        lines.push(`   ⏰ Lewat sejak: ${dateStr}`);
      });

      replyText = lines.join("\n");
    }
  }
  // 3. Command: Tambah Tugas (tambah Judul | Matkul | Due)
  else if (cleanMsg.startsWith("tambah ") || cleanMsg.startsWith("/tambah ")) {
    const content = message.replace(/^\/?tambah\s+/i, "").trim();
    const parts = content.split("|").map((p) => p.trim());

    if (parts.length < 2) {
      replyText = [
        "❌ *Format tambah tugas kurang lengkap.*",
        "",
        "Contoh format:",
        "*tambah Makalah AI | Kecerdasan Buatan | 2026-10-30 23:59*",
      ].join("\n");
    } else {
      const title = parts[0];
      const course = parts[1] || "Umum";
      const dueInput = parts[2] ? new Date(parts[2]) : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

      const dueStr = isNaN(dueInput.getTime())
        ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
        : dueInput.toISOString();

      addTask({
        userId: user.id,
        title,
        course,
        type: "tugas",
        due: dueStr,
        desc: "Ditambahkan via WhatsApp Bot",
        done: false,
        isManual: true,
      });

      replyText = `✅ *Tugas berhasil disimpan!*\n📌 *${title}*\n📚 Matkul: ${course}\n⏰ Tenggat: ${new Date(dueStr).toLocaleString("id-ID")}`;
    }
  }
  // 4. Command: Selesai Tugas
  else if (cleanMsg.startsWith("selesai ") || cleanMsg.startsWith("/selesai ")) {
    const target = message.replace(/^\/?selesai\s+/i, "").trim();
    const success = markTaskDoneByTitleOrId(target);

    if (success) {
      replyText = `✅ *Tugas berhasil ditandai selesai!* Kerja bagus! 🎉`;
    } else {
      replyText = `❓ Tidak menemukan tugas aktif dengan nama/ID "*${target}*". Cek kembali dengan ketik *tugas*.`;
    }
  }
  // 5. Default: Greeting / Help Menu
  else {
    const greetingName = senderName ? ` ${senderName}` : "";
    replyText = [
      `👋 *Halo${greetingName}!*`,
      "Saya adalah Bot Pengingat Tugas Kuliah Anda.",
      "",
      "📌 *Perintah yang dapat Anda ketik:*",
      "• *tugas* : Tanya daftar tugas aktif mendatang",
      "• *tertinggal* : Cek tugas yang sudah lewat tenggat",
      "• *tambah [Judul] | [Matkul] | [Tenggat]* : Tambah tugas baru",
      "• *selesai [Nama Tugas]* : Tandai tugas sudah selesai",
      "• *menu* : Buka menu bantuan ini",
      "",
      `📱 Terhubung ke akun: *${user.username}*`,
    ].join("\n");
  }

  // Send direct via Fonnte API as well to guarantee delivery regardless of webhook auto-reply setting
  if (user.whatsappToken) {
    await sendWhatsAppMessage(sender, replyText, user.whatsappToken);
  }

  // Also return standard Fonnte JSON reply
  return NextResponse.json({
    reply: replyText,
  });
}
