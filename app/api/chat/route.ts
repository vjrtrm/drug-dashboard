import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/app/lib/authUtils"
import { processChat, LLMUnavailableError } from "@/services/ChatService"
import { ConversationTurn } from "@/services/llm/types"

export async function POST(request: NextRequest) {
  // 1. Auth check
  const user = await getAuthUser(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // 2. Parse request body
  let body: { message?: unknown; history?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  // 3. Validate message
  const { message, history } = body
  if (!message || message === "") {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 })
  }
  if (typeof message !== "string" || message.length === 0) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 })
  }
  if (message.length > 2000) {
    return NextResponse.json({ error: "Message too long" }, { status: 400 })
  }

  // 4. Extract history (default to [])
  const conversationHistory: ConversationTurn[] = Array.isArray(history)
    ? (history as ConversationTurn[])
    : []

  // 5-7. Process chat and handle errors
  try {
    const response = await processChat(message, conversationHistory, user.id)
    return NextResponse.json(response)
  } catch (err) {
    if (err instanceof LLMUnavailableError) {
      return NextResponse.json(
        { error: "AI service temporarily unavailable" },
        { status: 503 }
      )
    }
    console.error("POST /api/chat failed", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
