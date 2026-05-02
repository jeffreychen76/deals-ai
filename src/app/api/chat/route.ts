import { NextRequest, NextResponse } from "next/server";
import { generateChatReply } from "@/lib/ai";
import { appendMessages, getState } from "@/lib/store";
import { ChatMessage } from "@/lib/types";
import { nowIso } from "@/lib/utils";

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as { message?: string };
  const message = payload.message?.trim();

  if (!message) {
    return new NextResponse("Message is required.", { status: 400 });
  }

  const timestamp = nowIso();
  const userMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: message,
    createdAt: timestamp
  };

  const currentState = await getState();
  const reply = await generateChatReply(currentState, message);
  const assistantMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: "assistant",
    content: reply,
    createdAt: nowIso()
  };

  const state = await appendMessages(userMessage, assistantMessage);
  return NextResponse.json({ state });
}
