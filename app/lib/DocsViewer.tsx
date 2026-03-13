"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";

export interface DocFile {
  name: string;
  content: string;
}

interface DocsViewerProps {
  docs: DocFile[];
}

export default function DocsViewer({ docs }: DocsViewerProps) {
  const [selected, setSelected] = useState(0);

  return (
    <div className="flex">
      {/* sidebar */}
      <nav aria-label="Documentation navigation" className="w-64 shrink-0 bg-gray-100 p-6 sticky top-0 h-screen overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">Documentation</h3>
        <ul className="flex flex-col space-y-1">
          {docs.map((doc, idx) => {
            const isActive = idx === selected;
            return (
              <li key={doc.name} aria-current={isActive ? "page" : undefined}>
                <button
                  onClick={() => setSelected(idx)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") setSelected(Math.min(idx + 1, docs.length - 1));
                    if (e.key === "ArrowUp") setSelected(Math.max(idx - 1, 0));
                  }}
                  className={`block w-full text-left px-3 py-2 rounded-l-md transition-colors flex items-center justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${isActive
                      ? "bg-blue-700 text-white border-l-4 border-blue-700"
                      : "text-blue-800 hover:bg-blue-100"
                    }`}
                >
                  {doc.name.replace(/\.md$/, "")}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* panel area */}
      <div aria-label="Documentation content" className="prose flex-1 max-w-none p-8 overflow-auto max-h-screen bg-black">
        <article>
          <h2 className="text-2xl font-bold mb-4">{docs[selected].name.replace(/\.md$/, "")}</h2>
          <ReactMarkdown>{docs[selected].content}</ReactMarkdown>
        </article>
      </div>
    </div>
  );
}