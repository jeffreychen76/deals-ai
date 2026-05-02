import { NextResponse } from "next/server";
import { getState } from "@/lib/store";

export async function GET() {
  const state = await getState();
  return NextResponse.json({ state });
}
