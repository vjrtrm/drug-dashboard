export type LLMProviderType = "openai" | "ollama"

export interface ConversationTurn {
  role: "user" | "assistant"
  content: string
}

export interface QueryFilters {
  phase?: string
  therapeuticArea?: string
  status?: string
  programId?: string
  nameContains?: string
  dateRange?: { from?: string; to?: string }
}

export interface QueryIntent {
  entity: "Program" | "Study" | "Milestone" | "mixed"
  action: "list" | "count" | "detail" | "aggregate"
  filters: QueryFilters
  limit?: number
}

export interface QueryResult {
  entity: string
  rows: Record<string, unknown>[]
  totalCount: number
}

export interface ChatRequest {
  message: string
  history?: ConversationTurn[]
}

export interface ChatResponse {
  answer: string
  data?: QueryResult
  citations?: string[]
}
