import { NextRequest, NextResponse } from "next/server";
import { createUser, findUserByEmailOrUsername, hashPassword, createSession } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const username = String(body.username ?? "").trim();
    const email = String(body.email ?? "").trim();
    const password = String(body.password ?? "");

    if (username.length < 3) {
      return NextResponse.json(
        { error: "Username minimal 3 karakter." },
        { status: 400 }
      );
    }

    if (!email.includes("@")) {
      return NextResponse.json(
        { error: "Alamat email tidak valid." },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password minimal 6 karakter." },
        { status: 400 }
      );
    }

    const existing = findUserByEmailOrUsername(email);

    if (existing) {
      return NextResponse.json(
        { error: "Email atau username sudah terdaftar." },
        { status: 409 }
      );
    }

    const { hash, salt } = hashPassword(password);
    const user = createUser(username, email, hash, salt);
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
      { error: `Gagal membuat akun: ${message}` },
      { status: 500 }
    );
  }
}
