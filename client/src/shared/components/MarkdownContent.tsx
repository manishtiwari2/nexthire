import React from 'react';
import { cn } from '../lib/cn';

/**
 * A compact, dependency-free Markdown renderer tuned for coding-problem statements.
 * Supports the constructs LeetCode/GfG problems actually use: headings, bold/italic,
 * inline code, fenced code blocks, ordered/unordered lists, tables, blockquotes,
 * horizontal rules, links, and images. Rendered with the app's design tokens so a
 * problem reads beautifully in the dark theme.
 *
 * It intentionally does NOT execute HTML — all output is React elements built from the
 * parsed structure, so author-provided markdown can never inject markup.
 */

interface MarkdownContentProps {
  content?: string | null;
  className?: string;
}

// ---- Inline parsing -------------------------------------------------------

// Turn a run of inline markdown into React nodes: `code`, **bold**, *italic*,
// ~~strike~~, [text](url), ![alt](url). Order matters — code spans win first.
function parseInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let remaining = text;
  let k = 0;

  // Ordered by precedence. Each matcher pulls the leading token off `remaining`.
  const patterns: { re: RegExp; render: (m: RegExpMatchArray, key: string) => React.ReactNode }[] = [
    {
      re: /^`([^`]+)`/,
      render: (m, key) => (
        <code
          key={key}
          className="rounded bg-surface-container-high px-1.5 py-0.5 font-mono text-[0.85em] text-primary"
        >
          {m[1]}
        </code>
      ),
    },
    {
      re: /^!\[([^\]]*)\]\(([^)\s]+)\)/,
      render: (m, key) => (
        <img key={key} src={m[2]} alt={m[1]} className="my-2 max-w-full rounded-lg border border-outline-variant" />
      ),
    },
    {
      re: /^\[([^\]]+)\]\(([^)\s]+)\)/,
      render: (m, key) => (
        <a
          key={key}
          href={m[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
        >
          {parseInline(m[1], key)}
        </a>
      ),
    },
    {
      re: /^\*\*([^*]+)\*\*/,
      render: (m, key) => <strong key={key} className="font-semibold text-on-surface">{parseInline(m[1], key)}</strong>,
    },
    {
      re: /^__([^_]+)__/,
      render: (m, key) => <strong key={key} className="font-semibold text-on-surface">{parseInline(m[1], key)}</strong>,
    },
    {
      re: /^~~([^~]+)~~/,
      render: (m, key) => <del key={key} className="text-on-surface-muted">{parseInline(m[1], key)}</del>,
    },
    {
      re: /^\*([^*]+)\*/,
      render: (m, key) => <em key={key} className="italic">{parseInline(m[1], key)}</em>,
    },
    {
      re: /^_([^_]+)_/,
      render: (m, key) => <em key={key} className="italic">{parseInline(m[1], key)}</em>,
    },
  ];

  let buffer = '';
  const flush = () => {
    if (buffer) {
      nodes.push(buffer);
      buffer = '';
    }
  };

  while (remaining.length > 0) {
    let matched = false;
    for (const { re, render } of patterns) {
      const m = remaining.match(re);
      if (m) {
        flush();
        nodes.push(render(m, `${keyPrefix}-${k++}`));
        remaining = remaining.slice(m[0].length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      buffer += remaining[0];
      remaining = remaining.slice(1);
    }
  }
  flush();
  return nodes;
}

// ---- Block parsing --------------------------------------------------------

interface Block {
  type: 'heading' | 'code' | 'ul' | 'ol' | 'table' | 'quote' | 'hr' | 'p';
  level?: number;
  lang?: string;
  lines: string[];
}

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
  const isTableSep = (l: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(l) && l.includes('-');

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Fenced code block
    const fence = line.match(/^```\s*([\w+-]*)\s*$/);
    if (fence) {
      const lang = fence[1] || '';
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // closing fence
      blocks.push({ type: 'code', lang, lines: body });
      continue;
    }

    // Heading
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, lines: [heading[2]] });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push({ type: 'hr', lines: [] });
      i++;
      continue;
    }

    // Table
    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const body: string[] = [line];
      i++; // header
      body.push(lines[i]); // separator
      i++;
      while (i < lines.length && isTableRow(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'table', lines: body });
      continue;
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'quote', lines: body });
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'ul', lines: body });
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      blocks.push({ type: 'ol', lines: body });
      continue;
    }

    // Paragraph (consume consecutive non-blank, non-special lines)
    const body: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^```/.test(lines[i]) &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*([-*_])\1{2,}\s*$/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i])
    ) {
      body.push(lines[i]);
      i++;
    }
    blocks.push({ type: 'p', lines: body });
  }

  return blocks;
}

function renderTable(rows: string[], key: string): React.ReactNode {
  const cells = (row: string) =>
    row
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());
  const header = cells(rows[0]);
  const bodyRows = rows.slice(2).map(cells);
  return (
    <div key={key} className="my-3 overflow-x-auto rounded-xl border border-outline-variant">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-surface-container-high">
            {header.map((h, j) => (
              <th key={j} className="border-b border-outline-variant px-3 py-2 text-left font-semibold text-on-surface">
                {parseInline(h, `${key}-h-${j}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((r, ri) => (
            <tr key={ri} className="odd:bg-surface-container-low/40">
              {r.map((c, ci) => (
                <td key={ci} className="border-b border-outline-variant/60 px-3 py-2 text-on-surface-variant">
                  {parseInline(c, `${key}-${ri}-${ci}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const HEADING_CLASS: Record<number, string> = {
  1: 'text-xl font-bold text-on-surface mt-5 mb-2',
  2: 'text-lg font-bold text-on-surface mt-5 mb-2',
  3: 'text-base font-semibold text-on-surface mt-4 mb-1.5',
  4: 'text-sm font-semibold text-on-surface mt-3 mb-1',
  5: 'text-sm font-semibold text-on-surface-variant mt-3 mb-1',
  6: 'text-xs font-semibold uppercase tracking-wide text-on-surface-muted mt-3 mb-1',
};

export const MarkdownContent: React.FC<MarkdownContentProps> = ({ content, className }) => {
  if (!content || !content.trim()) return null;
  const blocks = parseBlocks(content);

  return (
    <div className={cn('text-sm leading-relaxed text-on-surface-variant', className)}>
      {blocks.map((block, bi) => {
        const key = `b-${bi}`;
        switch (block.type) {
          case 'heading': {
            const Tag = `h${Math.min(block.level || 2, 6)}` as keyof JSX.IntrinsicElements;
            return (
              <Tag key={key} className={HEADING_CLASS[block.level || 2]}>
                {parseInline(block.lines[0], key)}
              </Tag>
            );
          }
          case 'code':
            return (
              <div key={key} className="group relative my-3">
                {block.lang && (
                  <span className="absolute right-2 top-2 rounded bg-surface-container px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-on-surface-muted">
                    {block.lang}
                  </span>
                )}
                <pre className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest p-3.5 font-mono text-[12.5px] leading-relaxed text-on-surface">
                  <code>{block.lines.join('\n')}</code>
                </pre>
              </div>
            );
          case 'hr':
            return <hr key={key} className="my-4 border-outline-variant" />;
          case 'quote':
            return (
              <blockquote
                key={key}
                className="my-3 border-l-2 border-primary/50 bg-surface-container-low/50 py-1.5 pl-3 pr-2 text-on-surface-variant"
              >
                {parseInline(block.lines.join('\n'), key)}
              </blockquote>
            );
          case 'ul':
            return (
              <ul key={key} className="my-2 ml-1 list-disc space-y-1 pl-4 marker:text-on-surface-muted">
                {block.lines.map((li, li2) => (
                  <li key={li2}>{parseInline(li, `${key}-${li2}`)}</li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={key} className="my-2 ml-1 list-decimal space-y-1 pl-5 marker:text-on-surface-muted">
                {block.lines.map((li, li2) => (
                  <li key={li2}>{parseInline(li, `${key}-${li2}`)}</li>
                ))}
              </ol>
            );
          case 'table':
            return renderTable(block.lines, key);
          case 'p':
          default:
            return (
              <p key={key} className="my-2 whitespace-pre-wrap">
                {parseInline(block.lines.join('\n'), key)}
              </p>
            );
        }
      })}
    </div>
  );
};

export default MarkdownContent;
