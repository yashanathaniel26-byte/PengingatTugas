import { NextRequest, NextResponse } from "next/server";
import { parseIcs } from "../route";
import { getSessionUser, addTask, getUserTasks, getAllUsers } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    let icsText = "";
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file");

      if (file instanceof Blob) {
        icsText = await file.text();
      }
    } else {
      // SAFETY: Checked content type and parsed json body with fallback
      const body = (await req.json().catch(() => ({}))) as { ics?: string };
      icsText = String(body.ics || "");
    }

    if (!icsText || !icsText.includes("BEGIN:VCALENDAR")) {
      return NextResponse.json(
        { ok: false, error: "File atau teks iCal tidak valid. Pastikan format file adalah .ics dari Moodle." },
        { status: 400 }
      );
    }

    const events = parseIcs(icsText);

    if (events.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Tidak ditemukan jadwal atau tugas dalam file kalender ini." },
        { status: 400 }
      );
    }

    // Resolve user (from session or default to yasir)
    const token = req.cookies.get("pt_session")?.value;
    let user = token ? getSessionUser(token) : null;

    if (!user) {
      const all = getAllUsers();
      user = all.find((u) => u.username === "yasir") || all[0] || null;
    }

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Pengguna tidak ditemukan." },
        { status: 401 }
      );
    }

    // Get existing tasks to avoid duplicate inserts
    const existing = getUserTasks(user.id);
    const existingTitles = new Set(existing.map((t) => t.title.toLowerCase().trim()));
    let addedCount = 0;

    for (const ev of events) {
      const titleLower = ev.title.toLowerCase().trim();

      if (!existingTitles.has(titleLower)) {
        addTask({
          userId: user.id,
          title: ev.title,
          course: ev.course,
          type: ev.type,
          due: ev.due,
          desc: ev.desc || "Diimpor dari file kalender LMS (.ics)",
          done: false,
          isManual: true,
        });

        existingTitles.add(titleLower);
        addedCount++;
      }
    }

    return NextResponse.json({
      ok: true,
      message: `Berhasil mengimpor ${events.length} jadwal tugas (${addedCount} tugas baru ditambahkan).`,
      totalEvents: events.length,
      addedCount,
      events,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    return NextResponse.json(
      { ok: false, error: `Gagal memproses file kalender: ${message}` },
      { status: 500 }
    );
  }
}
