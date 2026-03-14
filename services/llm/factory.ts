import OpenAI from "openai"

export function createLLMProvider(): OpenAI {
  const provider = process.env.LLM_PROVIDER ?? "openai"

  if (provider === "ollama") {
    const baseURL = process.env.OLLAMA_BASE_URL
    if (!baseURL) {
      throw new Error(
        "OLLAMA_BASE_URL is required when LLM_PROVIDER is set to 'ollama'. " +
          "Set it to your Ollama server URL, e.g. http://localhost:11434/v1"
      )
    }
    // Ensure the base URL ends with /v1 — Ollama's OpenAI-compatible API lives there
    const normalizedURL = baseURL.replace(/\/+$/, "")
    const finalURL = normalizedURL.endsWith("/v1") ? normalizedURL : `${normalizedURL}/v1`
    return new OpenAI({ baseURL: finalURL, apiKey: "ollama" })
  }

  // Default: openai
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is required when LLM_PROVIDER is 'openai' (or unset). " +
        "Add it to your .env.local file."
    )
  }
  return new OpenAI({ apiKey })
}

export function getModelName(): string {
  const provider = process.env.LLM_PROVIDER ?? "openai"
  if (provider === "ollama") {
    return process.env.OLLAMA_MODEL ?? "llama3"
  }
  return "gpt-4o-mini"
}
