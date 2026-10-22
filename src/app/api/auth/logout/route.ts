import { NextRequest, NextResponse } from "next/server";
import { deleteSession } from "@/lib/db";

export async function POST(req: NextRequest) {
  const token = req.cookies.get("session_token")?.value;

  if (token) {
    deleteSession(token);
  }

  const response = NextResponse.json({ success: true });

  response.cookies.set("session_token", "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
  });

  return response;
}
