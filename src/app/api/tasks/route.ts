import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, getUserTasks, addTask, deleteTask, toggleTaskDone } from "@/lib/db";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("session_token")?.value;

  if (!token) {
    return NextResponse.json({ tasks: [] });
  }

  const user = getSessionUser(token);

  if (!user) {
    return NextResponse.json({ tasks: [] });
  }

  const tasks = getUserTasks(user.id);

  return NextResponse.json({ tasks });
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
    const { title, course, type, due, desc } = body;

    if (!title || !due) {
      return NextResponse.json({ error: "Judul dan tenggat wajib diisi" }, { status: 400 });
    }

    const task = addTask({
      userId: user.id,
      title: String(title).trim(),
      course: course ? String(course).trim() : "Pribadi / Umum",
      type: type || "tugas",
      due: String(due),
      desc: desc ? String(desc).trim() : "",
      done: false,
      isManual: true,
    });

    return NextResponse.json({ success: true, task });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    return NextResponse.json({ error: `Gagal menyimpan tugas: ${message}` }, { status: 500 });
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
  const taskId = searchParams.get("id");

  if (!taskId) {
    return NextResponse.json({ error: "ID tugas diperlukan" }, { status: 400 });
  }

  const success = toggleTaskDone(user.id, taskId);

  return NextResponse.json({ success });
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
  const taskId = searchParams.get("id");

  if (!taskId) {
    return NextResponse.json({ error: "ID tugas diperlukan" }, { status: 400 });
  }

  const success = deleteTask(user.id, taskId);

  return NextResponse.json({ success });
}
