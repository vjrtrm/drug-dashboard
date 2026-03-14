import { APIError } from "openai"
import {
  ConversationTurn,
  QueryIntent,
  QueryResult,
  ChatResponse,
} from "./llm/types"
import { createLLMProvider, getModelName } from "./llm/factory"
import { executeQuery } from "../repositories/ChatQueryRepository"

export class LLMUnavailableError extends Error {
  constructor(message = "AI service temporarily unavailable") {
    super(message)
    this.name = "LLMUnavailableError"
  }
}

export function buildSystemPrompt(): string {
  return `You are a database query assistant. Given a user message, output ONLY a valid JSON object matching the QueryIntent schema below. Do not include any explanation or markdown — only the raw JSON.

Schema summary:
- Program: { id: string, name: string, phase: string, therapeuticArea: string, status: string }
- Study: { id: string, name: string, status: string, programId: string }
- Milestone: { id: string, name: string, status: string, targetDate: string, completedDate: string | null, programId: string }

Output a JSON object with exactly these fields:
{
  "entity": "Program" | "Study" | "Milestone" | "mixed",
  "action": "list" | "count" | "detail" | "aggregate",
  "filters": {
    "phase"?: string,
    "therapeuticArea"?: string,
    "status"?: string,
    "programId"?: string,
    "nameContains"?: string,
    "dateRange"?: { "from"?: string, "to"?: string }
  },
  "limit": number  // max 50
}`
}

export function extractEntityNames(rows: Record<string, unknown>[]): string[] {
  if (rows.length === 0) return []
  const seen = new Set<string>()
  for (const row of rows) {
    const val = row["name"] ?? row["title"]
    if (typeof val === "string" && val.length > 0) {
      seen.add(val)
    }
  }
  return Array.from(seen)
}

const SYNTHESIS_SYSTEM_PROMPT =
  "You are a helpful assistant for a drug development dashboard. " +
  "The user asked a question and the database returned results as JSON. " +
  "Summarize the results in a clear, concise natural language answer. " +
  "If there are no results, say so clearly."

export async function processChat(
  message: string,
  history: ConversationTurn[],
  _userId: string
): Promise<ChatResponse> {
  let llm: ReturnType<typeof createLLMProvider>
  let model: string

  try {
    llm = createLLMProvider()
    model = getModelName()
  } catch (err) {
    throw new LLMUnavailableError(
      err instanceof Error ? err.message : "AI service temporarily unavailable"
    )
  }

  // Phase 1: Intent extraction
  let intent: QueryIntent
  let intentRaw: Awaited<ReturnType<typeof llm.chat.completions.create>>
  try {
    const intentMessages = [
      { role: "system" as const, content: buildSystemPrompt() },
      ...history.slice(-10).map((t) => ({
        role: t.role as "user" | "assistant",
        content: t.content,
      })),
      { role: "user" as const, content: message },
    ]

    intentRaw = await llm.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: intentMessages,
    })
  } catch (err) {
    // Log the real error for debugging
    if (err instanceof APIError) {
      console.error(`[ChatService] OpenAI API error — status: ${err.status}, message: ${err.message}`)
    } else {
      console.error("[ChatService] LLM call failed (intent extraction):", err)
    }
    throw new LLMUnavailableError()
  }

  // Parse intent — graceful fallback on malformed JSON
  try {
    const raw = intentRaw.choices[0]?.message?.content ?? ""
    intent = JSON.parse(raw) as QueryIntent
  } catch {
    intent = { entity: "Program", action: "list", filters: {}, limit: 20 }
  }

  // Cap limit at 50
  intent.limit = Math.min(intent.limit ?? 20, 50)

  // Phase 2: Query execution
  const queryResult: QueryResult = await executeQuery(intent)

  // Phase 3: Answer synthesis
  let answer: string
  try {
    const synthesisMessages = [
      { role: "system" as const, content: SYNTHESIS_SYSTEM_PROMPT },
      { role: "user" as const, content: message },
      { role: "assistant" as const, content: JSON.stringify(queryResult) },
    ]

    const answerRaw = await llm.chat.completions.create({
      model,
      messages: synthesisMessages,
    })

    answer = answerRaw.choices[0]?.message?.content ?? "No answer available."
  } catch (err) {
    if (err instanceof APIError) {
      console.error(`[ChatService] OpenAI API error — status: ${err.status}, message: ${err.message}`)
    } else {
      console.error("[ChatService] LLM call failed (answer synthesis):", err)
    }
    throw new LLMUnavailableError()
  }

  return {
    answer,
    data: queryResult.rows.length > 0 ? queryResult : undefined,
    citations: extractEntityNames(queryResult.rows),
  }
}
