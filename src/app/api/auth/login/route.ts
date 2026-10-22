import { NextRequest, NextResponse } from "next/server";
import { findUserByEmailOrUsername, verifyPassword, createSession } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const identifier = String(body.identifier ?? "").trim();
    const password = String(body.password ?? "");

    if (!identifier || !password) {
      return NextResponse.json(
        { error: "Email/username dan password wajib diisi." },
        { status: 400 }
      );
    }

    const user = findUserByEmailOrUsername(identifier);

    if (!user) {
      return NextResponse.json(
        { error: "Akun tidak ditemukan. Periksa kembali email atau username Anda." },
        { status: 401 }
      );
    }

    const isMatch = verifyPassword(password, user.passwordHash, user.salt);

    if (!isMatch) {
      return NextResponse.json(
        { error: "Password yang Anda masukkan salah." },
        { status: 401 }
      );
    }

    const token = createSession(user.id);

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        icalUrl: user.icalUrl || "",
      },
    });

    response.cookies.set("session_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
    });

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    return NextResponse.json(
      { error: `Gagal masuk: ${message}` },
      { status: 500 }
    );
  }
}
