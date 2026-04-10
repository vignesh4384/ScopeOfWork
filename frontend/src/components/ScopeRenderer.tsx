/**
 * Renders LLM markdown-like scope text as properly formatted HTML.
 * Handles: headings (#, ##, ###, ####), bold (**text**), bullet points (- / *),
 * horizontal rules (---), pipe tables, and regular paragraphs.
 */
import type { ReactElement } from "react";

interface ScopeRendererProps {
  text: string;
  className?: string;
}

interface ParsedBlock {
  type: "h1" | "h2" | "h3" | "h4" | "bullet" | "hr" | "paragraph" | "blank" | "table";
  content: string;
  indent?: number;
  header?: string[];
  rows?: string[][];
}

/** True if the line looks like a markdown table row: starts AND ends with a pipe. */
function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") && t.endsWith("|") && t.length > 2;
}

/** Split a `| a | b | c |` row into trimmed cells, dropping outer pipes. */
function parseTableCells(line: string): string[] {
  const t = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return t.split("|").map((c) => c.trim());
}

/** True if the line is a separator row like `|---|:--:|---:|`. */
function isTableSeparator(line: string): boolean {
  if (!isTableRow(line)) return false;
  const cells = parseTableCells(line);
  if (cells.length === 0) return false;
  return cells.every((c) => /^:?-{2,}:?$/.test(c));
}

function parseBlocks(text: string): ParsedBlock[] {
  const lines = text.split("\n");
  const blocks: ParsedBlock[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Table: a pipe row immediately followed by a separator row
    if (
      isTableRow(line) &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      const header = parseTableCells(line);
      const rows: string[][] = [];
      i += 2; // skip header + separator
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(parseTableCells(lines[i]));
        i++;
      }
      blocks.push({ type: "table", content: "", header, rows });
      continue;
    }

    if (trimmed === "") {
      blocks.push({ type: "blank", content: "" });
      i++;
      continue;
    }

    if (/^-{3,}$/.test(trimmed) || /^\*{3,}$/.test(trimmed)) {
      blocks.push({ type: "hr", content: "" });
      i++;
      continue;
    }

    if (trimmed.startsWith("#### ")) {
      blocks.push({ type: "h4", content: trimmed.replace(/^####\s*/, "") });
      i++;
      continue;
    }
    if (trimmed.startsWith("### ")) {
      blocks.push({ type: "h3", content: trimmed.replace(/^###\s*/, "") });
      i++;
      continue;
    }
    if (trimmed.startsWith("## ")) {
      blocks.push({ type: "h2", content: trimmed.replace(/^##\s*/, "") });
      i++;
      continue;
    }
    if (trimmed.startsWith("# ")) {
      blocks.push({ type: "h1", content: trimmed.replace(/^#\s*/, "") });
      i++;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const indent = line.search(/\S/);
      const content = trimmed.replace(/^[-*]\s+/, "");
      blocks.push({ type: "bullet", content, indent: indent > 2 ? 1 : 0 });
      i++;
      continue;
    }

    blocks.push({ type: "paragraph", content: trimmed });
    i++;
  }

  return blocks;
}

/** Convert **bold** markers to <strong> tags */
function renderInline(text: string): (string | ReactElement)[] {
  const parts: (string | ReactElement)[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <strong key={match.index} className="font-semibold text-gray-900">
        {match[1]}
      </strong>
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

export default function ScopeRenderer({ text, className = "" }: ScopeRendererProps) {
  const blocks = parseBlocks(text);

  return (
    <div className={`scope-rendered space-y-1 ${className}`}>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case "h1":
            return (
              <div key={idx} className="pt-4 pb-2">
                <h1 className="text-xl font-bold text-primary-dark tracking-tight">
                  {renderInline(block.content)}
                </h1>
                <div className="mt-1.5 h-0.5 w-16 bg-primary rounded-full" />
              </div>
            );
          case "h2":
            return (
              <h2 key={idx} className="text-lg font-bold text-primary pt-4 pb-1">
                {renderInline(block.content)}
              </h2>
            );
          case "h3":
            return (
              <h3 key={idx} className="text-base font-bold text-gray-800 pt-3 pb-0.5">
                {renderInline(block.content)}
              </h3>
            );
          case "h4":
            return (
              <h4 key={idx} className="text-sm font-bold text-gray-700 pt-2 pb-0.5">
                {renderInline(block.content)}
              </h4>
            );
          case "bullet":
            return (
              <div
                key={idx}
                className="flex items-start gap-2.5 text-sm text-gray-700 leading-relaxed"
                style={{ paddingLeft: block.indent ? 24 : 8 }}
              >
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                <span>{renderInline(block.content)}</span>
              </div>
            );
          case "hr":
            return <hr key={idx} className="my-3 border-gray-200" />;
          case "blank":
            return <div key={idx} className="h-2" />;
          case "paragraph":
            return (
              <p key={idx} className="text-sm text-gray-700 leading-relaxed">
                {renderInline(block.content)}
              </p>
            );
          case "table": {
            const header = block.header ?? [];
            const rows = block.rows ?? [];
            return (
              <div key={idx} className="my-3 overflow-x-auto">
                <table className="min-w-full border-collapse border border-gray-300 text-xs">
                  {header.length > 0 && (
                    <thead className="bg-primary/5">
                      <tr>
                        {header.map((cell, j) => (
                          <th
                            key={j}
                            className="border border-gray-300 px-2 py-1.5 text-left font-semibold text-gray-800 whitespace-nowrap"
                          >
                            {renderInline(cell)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                  )}
                  <tbody>
                    {rows.map((row, r) => (
                      <tr key={r} className={r % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        {row.map((cell, c) => (
                          <td
                            key={c}
                            className="border border-gray-300 px-2 py-1 text-gray-700 align-top"
                          >
                            {renderInline(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
        }
      })}
    </div>
  );
}
