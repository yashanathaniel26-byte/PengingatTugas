import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, getUserNotes, addNote, updateNote, deleteNote } from "@/lib/db";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("session_token")?.value;

  if (!token) {
    return NextResponse.json({ notes: [] });
  }

  const user = getSessionUser(token);

  if (!user) {
    return NextResponse.json({ notes: [] });
  }

  const notes = getUserNotes(user.id);

  return NextResponse.json({ notes });
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get("session_token")?.value;

  if (!token) {
    return NextResponse.json({ error: "Silakan masuk terlebih dahulu" }, { status: 401 });
  }

  const user = getSessionUser(token);

  if (!user) {
    return NextResponse.json({ error: "Sesi tidak valid" }, { status: 401 });
  }

  try {
    const body = await req.json();

    const title = String(body.title ?? "").trim();
    const rawCategory = String(body.category ?? "umum").trim();

    const category: "matkul" | "evaluasi" | "kerjaan" | "umum" =
      rawCategory === "matkul" || rawCategory === "evaluasi" || rawCategory === "kerjaan"
        ? rawCategory
        : "umum";

    const course = String(body.course ?? "").trim();
    const content = String(body.content ?? "").trim();
    const pinned = Boolean(body.pinned);

    if (!title) {
      return NextResponse.json({ error: "Judul catatan wajib diisi" }, { status: 400 });
    }

    const note = addNote({
      userId: user.id,
      title,
      category,
      course: course || undefined,
      content,
      pinned,
    });

    return NextResponse.json({ success: true, note });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    return NextResponse.json({ error: `Gagal menyimpan catatan: ${message}` }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const token = req.cookies.get("session_token")?.value;

  if (!token) {
    return NextResponse.json({ error: "Silakan masuk terlebih dahulu" }, { status: 401 });
  }

  const user = getSessionUser(token);

  if (!user) {
    return NextResponse.json({ error: "Sesi tidak valid" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const noteId = searchParams.get("id");

  if (!noteId) {
    return NextResponse.json({ error: "ID catatan diperlukan" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const updates: Parameters<typeof updateNote>[2] = {};

    if (body.title !== undefined) {
      updates.title = String(body.title).trim();
    }

    if (body.category !== undefined) {
      const c = String(body.category);

      if (c === "matkul" || c === "evaluasi" || c === "kerjaan" || c === "umum") {
        updates.category = c;
      }
    }

    if (body.course !== undefined) {
      updates.course = String(body.course).trim();
    }

    if (body.content !== undefined) {
      updates.content = String(body.content).trim();
    }

    if (body.pinned !== undefined) {
      updates.pinned = Boolean(body.pinned);
    }

    const updatedNote = updateNote(user.id, noteId, updates);

    if (!updatedNote) {
      return NextResponse.json({ error: "Catatan tidak ditemukan" }, { status: 404 });
    }

    return NextResponse.json({ success: true, note: updatedNote });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    return NextResponse.json({ error: `Gagal memperbarui catatan: ${message}` }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const token = req.cookies.get("session_token")?.value;

  if (!token) {
    return NextResponse.json({ error: "Silakan masuk terlebih dahulu" }, { status: 401 });
  }

  const user = getSessionUser(token);

  if (!user) {
    return NextResponse.json({ error: "Sesi tidak valid" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const noteId = searchParams.get("id");

  if (!noteId) {
    return NextResponse.json({ error: "ID catatan diperlukan" }, { status: 400 });
  }

  const success = deleteNote(user.id, noteId);

  return NextResponse.json({ success });
}
