# Requirements Document

## Introduction

This document defines the requirements for the LLM Chat Interface feature of the Drug Development Dashboard. The feature enables authenticated users to query Programs, Studies, and Milestones using natural language. A two-phase LLM flow extracts a structured query intent from the user message, executes safe Prisma queries against PostgreSQL, and synthesizes a human-readable answer. The system supports OpenAI and local Ollama as interchangeable LLM providers via a provider abstraction layer.

## Glossary

- **Chat_API**: The Next.js route handler at `POST /api/chat` that is the entry point for all chat requests.
- **Chat_Page**: The React client page at `app/chat/page.tsx` that renders the conversation UI.
- **ChatService**: The server-side orchestration module at `services/ChatService.ts` that coordinates intent extraction, query execution, and answer synthesis.
- **LLMProviderFactory**: The factory function `createLLMProvider()` in `services/llm/factory.ts` that returns a configured OpenAI-SDK-compatible client.
- **LLMProvider**: The OpenAI SDK client instance returned by `LLMProviderFactory`, configured for either OpenAI or Ollama.
- **ChatQueryRepository**: The repository module at `repositories/ChatQueryRepository.ts` that translates a `QueryIntent` into Prisma queries.
- **QueryIntent**: A structured JSON object describing the entity, action, filters, and row limit extracted from a user message.
- **QueryResult**: A structured object containing the entity type, result rows, and total count returned by `ChatQueryRepository`.
- **ChatRequest**: The JSON body sent by the client to `POST /api/chat`, containing `message` and optional `history`.
- **ChatResponse**: The JSON body returned by `Chat_API`, containing `answer`, optional `data`, and optional `citations`.
- **ConversationTurn**: A single `{ role, content }` entry in the conversation history.
- **Auth_Middleware**: The `getAuthUser(request)` function from `app/lib/authUtils.ts` that validates the JWT and returns the authenticated user.

---

## Requirements

### Requirement 1: Chat UI Page

**User Story:** As an authenticated user, I want a dedicated chat page, so that I can type natural-language questions and see answers in a conversation view.

#### Acceptance Criteria

1. THE Chat_Page SHALL render a scrollable conversation history displaying all user and assistant messages.
2. THE Chat_Page SHALL render a text input field and a send button for composing new messages.
3. WHILE a chat request is in flight, THE Chat_Page SHALL display a loading indicator and disable the send button.
4. WHEN the Chat_Page loads and the user is not authenticated, THE Chat_Page SHALL redirect the user to `/login`.
5. WHEN an assistant response includes a `data` payload, THE Chat_Page SHALL render the rows as a sortable table below the answer text.
6. WHEN the user submits a message, THE Chat_Page SHALL include only the last 10 conversation turns in the `history` field of the request.

---

### Requirement 2: Chat API Route Authentication

**User Story:** As a system operator, I want the chat endpoint to enforce authentication, so that only logged-in users can query the database via the LLM.

#### Acceptance Criteria

1. WHEN a request arrives at `POST /api/chat` without a valid JWT, THE Chat_API SHALL return HTTP 401 with `{ "error": "Unauthorized" }`.
2. WHEN a request arrives at `POST /api/chat` with a valid JWT, THE Chat_API SHALL extract the authenticated user and pass the user ID to `ChatService`.
3. THE Chat_API SHALL use the existing `getAuthUser(request)` function from `app/lib/authUtils.ts` for JWT validation without modification.
4. WHERE the authenticated user has role VIEWER, EDITOR, or ADMIN, THE Chat_API SHALL permit the request to proceed.

---

### Requirement 3: Chat API Route Request Validation

**User Story:** As a system operator, I want the chat endpoint to validate incoming requests, so that malformed or oversized inputs are rejected before reaching the LLM.

#### Acceptance Criteria

1. WHEN the request body contains a `message` field that is empty or absent, THE Chat_API SHALL return HTTP 400 with `{ "error": "Invalid message" }`.
2. WHEN the request body contains a `message` field whose length exceeds 2000 characters, THE Chat_API SHALL return HTTP 400 with `{ "error": "Message too long" }`.
3. THE Chat_API SHALL accept an optional `history` array of `ConversationTurn` objects in the request body.
4. IF the request body cannot be parsed as JSON, THEN THE Chat_API SHALL return HTTP 400 with an error response.

---

### Requirement 4: Two-Phase LLM Processing

**User Story:** As a user, I want my natural-language question to be understood and answered accurately, so that I receive relevant data from the database.

#### Acceptance Criteria

1. WHEN `ChatService` receives a message, THE ChatService SHALL call `LLMProvider` with JSON mode enabled to extract a `QueryIntent` from the message and conversation history.
2. WHEN the intent extraction LLM call succeeds, THE ChatService SHALL pass the resulting `QueryIntent` to `ChatQueryRepository.executeQuery()`.
3. WHEN `ChatQueryRepository` returns a `QueryResult`, THE ChatService SHALL call `LLMProvider` a second time to synthesize a natural-language answer from the query result.
4. THE ChatService SHALL build a system prompt that includes a summary of the database schema (Program, Study, Milestone fields) before the first LLM call.
5. THE ChatService SHALL cap `intent.limit` at 50 rows regardless of the value returned by the LLM.
6. THE ChatService SHALL include at most the last 10 `ConversationTurn` entries from `history` in the intent extraction prompt.
7. WHEN the LLM returns a `ChatResponse`, THE ChatService SHALL populate the `citations` field with unique entity names extracted from the result rows.

---

### Requirement 5: LLM JSON Parse Failure Handling

**User Story:** As a user, I want to receive a helpful response even when the AI cannot parse my question, so that I am never shown a raw server error.

#### Acceptance Criteria

1. IF the LLM returns content that cannot be parsed as a valid `QueryIntent`, THEN THE ChatService SHALL catch the parse error and fall back to a broad `list` query on `Program`.
2. IF the fallback query produces a result, THEN THE ChatService SHALL synthesize an answer from that result and return it as a normal `ChatResponse`.
3. THE Chat_API SHALL never return HTTP 500 due to a JSON parse failure from the LLM.

---

### Requirement 6: LLM Provider Unavailability Handling

**User Story:** As a user, I want a clear message when the AI service is down, so that I understand the issue and can try again later.

#### Acceptance Criteria

1. IF the `LLMProvider` throws a network or rate-limit error during any LLM call, THEN THE Chat_API SHALL return HTTP 503 with `{ "error": "AI service temporarily unavailable" }`.
2. THE Chat_Page SHALL display a user-friendly retry message when it receives a 503 response from `Chat_API`.

---

### Requirement 7: LLM Provider Abstraction

**User Story:** As a developer, I want to switch between OpenAI and a local Ollama instance via environment variables, so that I can develop and test without incurring API costs.

#### Acceptance Criteria

1. THE LLMProviderFactory SHALL read the `LLM_PROVIDER` environment variable and return an OpenAI-SDK-compatible client configured for the selected provider.
2. WHERE `LLM_PROVIDER` is `"openai"`, THE LLMProviderFactory SHALL configure the client using `OPENAI_API_KEY`.
3. WHERE `LLM_PROVIDER` is `"ollama"`, THE LLMProviderFactory SHALL configure the client with `baseURL` set to `OLLAMA_BASE_URL` and `apiKey` set to the placeholder value `"ollama"`.
4. WHERE `LLM_PROVIDER` is `"ollama"`, THE ChatService SHALL use the model name from `OLLAMA_MODEL` (defaulting to `"llama3"`) in each completion request.
5. WHERE `LLM_PROVIDER` is `"openai"`, THE ChatService SHALL use `"gpt-4o-mini"` as the model name in each completion request.
6. IF `LLM_PROVIDER` is `"openai"` and `OPENAI_API_KEY` is absent or empty, THEN THE LLMProviderFactory SHALL throw a descriptive error at startup.
7. IF `LLM_PROVIDER` is `"ollama"` and `OLLAMA_BASE_URL` is absent or empty, THEN THE LLMProviderFactory SHALL throw a descriptive error at startup.
8. THE ChatService SHALL call `createLLMProvider()` once per request and use the returned client for both LLM calls without any provider-specific branching inside `ChatService`.

---

### Requirement 8: Safe Database Query Execution

**User Story:** As a system operator, I want all database queries to be generated safely via Prisma, so that LLM output can never cause SQL injection or unintended data mutations.

#### Acceptance Criteria

1. THE ChatQueryRepository SHALL translate a `QueryIntent` into Prisma `findMany` and `count` calls using only typed `where` clause fields.
2. THE ChatQueryRepository SHALL never execute raw SQL strings against the database.
3. THE ChatQueryRepository SHALL enforce a hard `take` cap of 50 rows on every query, regardless of the `limit` value in the `QueryIntent`.
4. THE ChatQueryRepository SHALL return a `QueryResult` containing the `entity` type, the `rows` array, and the `totalCount`.
5. THE ChatQueryRepository SHALL perform only read operations and SHALL NOT mutate any database records.
6. WHEN `intent.entity` is `"Program"`, THE ChatQueryRepository SHALL include related `studies` and `milestones` in the result rows via Prisma `include`.
7. WHEN `intent.entity` is `"mixed"`, THE ChatQueryRepository SHALL query all three models (Program, Study, Milestone) with a per-model cap of 10 rows and merge the results.

---

### Requirement 9: Where Clause Filter Mapping

**User Story:** As a user, I want my filter criteria (phase, status, therapeutic area, etc.) to be applied correctly to database queries, so that I receive accurate, filtered results.

#### Acceptance Criteria

1. WHEN `QueryFilters.phase` is defined, THE ChatQueryRepository SHALL apply a case-insensitive `contains` filter on the `phase` field.
2. WHEN `QueryFilters.therapeuticArea` is defined and `intent.entity` is `"Program"`, THE ChatQueryRepository SHALL apply a case-insensitive `contains` filter on the `therapeuticArea` field.
3. WHEN `QueryFilters.status` is defined, THE ChatQueryRepository SHALL apply a case-insensitive `contains` filter on the `status` field.
4. WHEN `QueryFilters.nameContains` is defined, THE ChatQueryRepository SHALL apply a case-insensitive `contains` filter on the `name` field.
5. WHEN `QueryFilters.programId` is defined and `intent.entity` is not `"Program"`, THE ChatQueryRepository SHALL apply an exact match filter on the `programId` field.
6. WHEN `QueryFilters.dateRange` is defined and `intent.entity` is `"Milestone"`, THE ChatQueryRepository SHALL apply `gte` and `lte` filters on the `targetDate` field using the provided `from` and `to` date strings.
7. THE ChatQueryRepository SHALL omit any filter key whose value is `undefined` from the Prisma `where` clause.

---

### Requirement 10: Empty Query Result Handling

**User Story:** As a user, I want a clear "no results" message when my query matches nothing, so that I know the database was queried successfully but returned no data.

#### Acceptance Criteria

1. WHEN `ChatQueryRepository` returns a `QueryResult` with an empty `rows` array, THE ChatService SHALL still call `LLMProvider` for answer synthesis.
2. WHEN the `rows` array is empty, THE ChatService SHALL return a `ChatResponse` with `data` set to `undefined` and an `answer` that communicates no results were found.

---

### Requirement 11: Chat API Response Format

**User Story:** As a frontend developer, I want a consistent JSON response shape from the chat endpoint, so that the UI can reliably render answers and data tables.

#### Acceptance Criteria

1. WHEN `Chat_API` returns HTTP 200, THE Chat_API SHALL include an `answer` field containing a non-empty string.
2. WHEN the query produced rows, THE Chat_API SHALL include a `data` field of type `QueryResult` in the response.
3. WHEN the query produced no rows, THE Chat_API SHALL omit the `data` field from the response.
4. WHEN entity names are present in the result rows, THE Chat_API SHALL include a `citations` array of unique name strings in the response.

---

### Requirement 12: Conversation History Management

**User Story:** As a user, I want the assistant to remember the context of our conversation, so that follow-up questions are answered correctly.

#### Acceptance Criteria

1. THE Chat_Page SHALL maintain conversation history in client-side state only and SHALL NOT persist history to the server or any storage.
2. WHEN sending a request, THE Chat_Page SHALL include at most the last 10 `ConversationTurn` entries in the `history` field.
3. THE ChatService SHALL pass the provided `history` turns to the LLM in the intent extraction prompt to enable contextual follow-up queries.

---

### Requirement 13: Security Constraints

**User Story:** As a security engineer, I want the chat feature to follow the existing security model, so that no new attack surfaces are introduced.

#### Acceptance Criteria

1. THE Chat_API SHALL never expose the `OPENAI_API_KEY` or `OLLAMA_BASE_URL` environment variables in any HTTP response.
2. THE ChatQueryRepository SHALL ignore any keys in the LLM-generated `QueryIntent` that do not correspond to known, typed filter fields.
3. THE Chat_API SHALL validate `message` length server-side before passing it to `ChatService`, regardless of any client-side validation.
4. WHERE `LLM_PROVIDER` is `"ollama"`, THE LLMProviderFactory SHALL only accept an `OLLAMA_BASE_URL` that points to an internal or private network address as documented in the deployment guide.
