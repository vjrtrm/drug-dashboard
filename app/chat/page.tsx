"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/app/lib/AuthContext"
import type { QueryResult, ConversationTurn } from "@/services/llm/types"

interface Message {
  role: "user" | "assistant"
  content: string
  data?: QueryResult
  timestamp: Date
}

type SortConfig = {
  column: string
  direction: "asc" | "desc"
}

function DataTable({ data }: { data: QueryResult }) {
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null)

  if (!data.rows.length) return null

  const columns = Object.keys(data.rows[0])

  const sortedRows = [...data.rows].sort((a, b) => {
    if (!sortConfig) return 0
    const aVal = a[sortConfig.column]
    const bVal = b[sortConfig.column]
    const aStr = String(aVal ?? "")
    const bStr = String(bVal ?? "")
    const cmp = aStr.localeCompare(bStr)
    return sortConfig.direction === "asc" ? cmp : -cmp
  })

  const handleSort = (col: string) => {
    setSortConfig(prev =>
      prev?.column === col
        ? { column: col, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { column: col, direction: "asc" }
    )
  }

  return (
    <div className="mt-3 overflow-x-auto rounded border border-gray-200">
      <table className="min-w-full text-sm divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {columns.map(col => {
              const isActive = sortConfig?.column === col
              const indicator = isActive ? (sortConfig.direction === "asc" ? " ↑" : " ↓") : ""
              return (
                <th
                  key={col}
                  scope="col"
                  className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort(col)}
                  aria-sort={isActive ? (sortConfig.direction === "asc" ? "ascending" : "descending") : "none"}
                >
                  {col}{indicator}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {sortedRows.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50">
              {columns.map(col => (
                <td key={col} className="px-4 py-2 text-gray-800 whitespace-nowrap">
                  {String(row[col] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-2 text-xs text-gray-500 bg-gray-50 border-t border-gray-200">
        {data.totalCount} total {data.entity}(s)
      </div>
    </div>
  )
}

export default function ChatPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login")
    }
  }, [user, authLoading, router])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isLoading])

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return

    const userMessage: Message = {
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    const history: ConversationTurn[] = messages
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content }))

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history }),
      })

      if (res.status === 503) {
        setMessages(prev => [
          ...prev,
          {
            role: "assistant",
            content: "The AI service is temporarily unavailable. Please try again in a moment.",
            timestamp: new Date(),
          },
        ])
        return
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setMessages(prev => [
          ...prev,
          {
            role: "assistant",
            content: err.error || "Something went wrong. Please try again.",
            timestamp: new Date(),
          },
        ])
        return
      }

      const data = await res.json()
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: data.answer,
          data: data.data,
          timestamp: new Date(),
        },
      ])
    } catch {
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: "Unable to reach the server. Please check your connection and try again.",
          timestamp: new Date(),
        },
      ])
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div role="status" aria-live="polite" className="text-gray-600">Loading...</div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <h1 className="text-lg font-semibold text-gray-900">Chat</h1>
        <span className="text-sm text-gray-500">{user.name || user.email}</span>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400 text-sm">Ask a question about your programs, studies, or milestones.</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                msg.role === "user"
                  ? "bg-blue-600 text-white rounded-br-sm"
                  : "bg-white text-gray-800 border border-gray-200 rounded-bl-sm"
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
              {msg.data && <DataTable data={msg.data} />}
              <p className={`text-xs mt-1 ${msg.role === "user" ? "text-blue-200" : "text-gray-400"}`}>
                {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <div role="status" aria-live="polite" className="flex items-center gap-1">
                <span className="sr-only">Loading response...</span>
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="bg-white border-t border-gray-200 px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-end gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about programs, studies, or milestones..."
            rows={1}
            disabled={isLoading}
            aria-label="Chat message input"
            className="flex-1 resize-none px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm text-gray-900 placeholder-gray-400 disabled:bg-gray-50 disabled:cursor-not-allowed max-h-40 overflow-y-auto"
            style={{ minHeight: "48px" }}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            aria-label="Send message"
            className="px-5 py-3 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? "Sending..." : "Send"}
          </button>
        </div>
        <p className="text-xs text-gray-400 text-center mt-2">Press Enter to send, Shift+Enter for new line</p>
      </div>
    </div>
  )
}
