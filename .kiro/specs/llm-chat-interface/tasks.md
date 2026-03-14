# Implementation Plan: LLM Chat Interface

## Overview

Implement a natural-language chat interface for the Drug Development Dashboard. The work is broken into five incremental phases: shared types, LLM provider abstraction, query repository, chat service orchestration, API route, and the React chat UI.

## Tasks

- [x] 1. Define shared TypeScript types
  - Create `services/llm/types.ts` with `QueryIntent`, `QueryFilters`, `QueryResult`, `ChatRequest`, `ChatResponse`, and `ConversationTurn` interfaces
  - _Requirements: 3.3, 4.1, 8.4, 11.1_

- [ ] 2. Implement LLM Provider Factory
  - [x] 2.1 Create `services/llm/factory.ts` implementing `createLLMProvider()`
    - Read `LLM_PROVIDER`, `OPENAI_API_KEY`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL` from `process.env`
    - Return a configured `OpenAI` SDK instance for `"openai"` or `"ollama"`
    - Throw a descriptive error at startup when required env vars are missing
    - _Requirements: 7.1, 7.2, 7.3, 7.6, 7.7_
  - [ ]* 2.2 Write property test for `createLLMProvider`
    - **Property 14: LLMProviderFactory returns an OpenAI-SDK-compatible client for all valid providers**
    - **Validates: Requirements 7.1, 7.8**

- [ ] 3. Implement `buildWhereClause` and `ChatQueryRepository`
  - [x] 3.1 Create `repositories/ChatQueryRepository.ts` with `buildWhereClause` and `executeQuery`
    - Map each `QueryFilters` field to the correct Prisma operator (case-insensitive `contains`, exact match, `gte`/`lte`)
    - Omit any filter key whose value is `undefined`
    - Enforce hard `take` cap of 50 rows on every query
    - For `"Program"` entity, include related `studies` and `milestones`
    - For `"mixed"` entity, query all three models with per-model cap of 10 and merge results
    - Perform only read operations (no mutations)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_
  - [ ]* 3.2 Write property test for `buildWhereClause` — no undefined keys
    - **Property 8: buildWhereClause produces only defined, typed filter fields**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 13.2**
  - [ ]* 3.3 Write property test for `executeQuery` — row cap always ≤ 50
    - **Property 7: Row cap is always enforced at 50**
    - **Validates: Requirements 4.5, 8.3**
  - [ ]* 3.4 Write property test for `QueryResult` shape
    - **Property 11: QueryResult always has the required shape**
    - **Validates: Requirements 8.4**

- [ ] 4. Implement `ChatService`
  - [x] 4.1 Create `services/ChatService.ts` with `processChat`, `buildSystemPrompt`, and `extractEntityNames`
    - Call `createLLMProvider()` once per request; use returned client for both LLM calls
    - Phase 1: call LLM with JSON mode to extract `QueryIntent`; cap `intent.limit` at 50
    - Include at most the last 10 `ConversationTurn` entries in the intent extraction prompt
    - Phase 2: call `executeQuery(intent)` then call LLM again to synthesize a natural-language answer
    - Populate `citations` with unique entity names via `extractEntityNames`
    - On JSON parse failure: fall back to a broad `list` query on `Program` and synthesize answer from that result
    - On LLM network/rate-limit error: throw a typed error that the API route maps to HTTP 503
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.2, 5.3, 6.1, 7.4, 7.5, 7.8, 10.1, 10.2_
  - [ ]* 4.2 Write property test for `extractEntityNames` — unique strings only
    - **Property 13: citations contains only unique strings**
    - **Validates: Requirements 4.7, 11.4**
  - [ ]* 4.3 Write property test for history cap
    - **Property 6: History is always capped at 10 turns before LLM call**
    - **Validates: Requirements 1.6, 4.6, 12.2**
  - [ ]* 4.4 Write property test for `data` field presence matching row count
    - **Property 12: data field presence matches row count**
    - **Validates: Requirements 11.2, 11.3**
  - [ ]* 4.5 Write property test for LLM JSON parse failure — never HTTP 500
    - **Property 9: LLM JSON parse failure never produces HTTP 500**
    - **Validates: Requirements 5.1, 5.2, 5.3**

- [x] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Implement Chat API Route
  - [x] 6.1 Create `app/api/chat/route.ts` with a `POST` handler
    - Validate JWT via `getAuthUser(request)` from `app/lib/authUtils.ts`; return 401 if null
    - Parse request body; return 400 for non-JSON, absent/empty `message`, or `message.length > 2000`
    - Delegate to `processChat(message, history ?? [], user.id)`
    - Map LLM unavailability errors to HTTP 503 with `{ "error": "AI service temporarily unavailable" }`
    - Never expose `OPENAI_API_KEY` or `OLLAMA_BASE_URL` in any response body
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 6.1, 11.1, 13.1, 13.3_
  - [ ]* 6.2 Write property test for unauthenticated requests → 401
    - **Property 1: Unauthenticated requests always yield 401**
    - **Validates: Requirements 2.1**
  - [ ]* 6.3 Write property test for message length validation boundary
    - **Property 3: Message length validation boundary**
    - **Validates: Requirements 3.2, 13.3**
  - [ ]* 6.4 Write property test for empty/absent message → 400
    - **Property 4: Empty and absent messages are rejected**
    - **Validates: Requirements 3.1**
  - [ ]* 6.5 Write property test for non-JSON body → 400
    - **Property 5: Non-JSON request bodies are rejected**
    - **Validates: Requirements 3.4**
  - [ ]* 6.6 Write property test for sensitive env vars never in responses
    - **Property 15: Sensitive env vars never appear in HTTP responses**
    - **Validates: Requirements 13.1**
  - [ ]* 6.7 Write property test for authenticated valid requests → 200 with non-empty answer
    - **Property 2: Authenticated requests with valid messages always yield a non-empty answer**
    - **Validates: Requirements 2.2, 4.1, 4.2, 4.3, 11.1**
  - [ ]* 6.8 Write property test for LLM network errors → 503
    - **Property 10: LLM network errors always produce HTTP 503**
    - **Validates: Requirements 6.1**

- [ ] 7. Implement Chat UI Page
  - [x] 7.1 Create `app/chat/page.tsx` with conversation history, input field, send button, and loading state
    - Use `useAuth()` to redirect unauthenticated users to `/login`
    - Maintain conversation history in client-side state only (no server persistence)
    - POST to `/api/chat` with current message and `history.slice(-10)`
    - Disable send button and show loading indicator while request is in flight
    - Render assistant `data` payload as a sortable table when present
    - Display a user-friendly retry message on 503 responses
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 6.2, 12.1, 12.2_

- [x] 8. Install `openai` package and wire environment variables
  - Add `openai` npm package to `package.json` dependencies
  - Document required env vars (`LLM_PROVIDER`, `OPENAI_API_KEY`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`) in `.env.local` (with placeholder values, not committed)
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 9. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Property tests use `fast-check` (add as a dev dependency if not present)
- Each task references specific requirements for traceability
- The `openai` npm package is used for both OpenAI and Ollama providers — only `baseURL` and `apiKey` differ
