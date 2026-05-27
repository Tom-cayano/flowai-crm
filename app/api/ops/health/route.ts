import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "health route works",
    timestamp: new Date().toISOString(),
  });
}import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "health route works",
    timestamp: new Date().toISOString(),
  });
}
