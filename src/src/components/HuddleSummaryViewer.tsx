'use client';

import { HuddleSummary } from '@/lib/types';

interface Props {
  summaries: HuddleSummary[];
}

function parseMarkdown(content: string) {
  const lines = content.split('\n');
  const sections = [];
  let currentSection = null;
  let currentItems = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Section headings
    if (trimmed.match(/^#+\s/)) {
      if (currentSection && currentItems.length > 0) {
        sections.push({ type: currentSection, items: currentItems });
        currentItems = [];
      }
      currentSection = trimmed.replace(/^#+\s/, '').trim();
      continue;
    }

    // Checkbox items
    if (trimmed.match(/^\[[\sx]\]\s/)) {
      const isChecked = trimmed.includes('[x]') || trimmed.includes('[X]');
      const text = trimmed.replace(/^\[[\sx]\]\s/, '').trim();
      currentItems.push({ type: 'checkbox', text, checked: isChecked });
      continue;
    }

    // Numbered items
    if (trimmed.match(/^\d+\.\s/)) {
      const text = trimmed.replace(/^\d+\.\s/, '').trim();
      currentItems.push({ type: 'numbered', text });
      continue;
    }

    // Bold text (could be title or content)
    if (trimmed.match(/^\*\*.*\*\*:?$|^__.*__:?$/)) {
      if (currentItems.length > 0) {
        sections.push({ type: currentSection, items: currentItems });
        currentItems = [];
      }
      currentSection = trimmed.replace(/\*\*|__/g, '').replace(/:$/, '').trim();
      continue;
    }

    // Bullet items
    if (trimmed.match(/^[-*+]\s/)) {
      const text = trimmed.replace(/^[-*+]\s/, '').trim();
      currentItems.push({ type: 'bullet', text });
      continue;
    }

    // Regular text
    if (trimmed) {
      currentItems.push({ type: 'text', text: trimmed });
    }
  }

  if (currentSection && currentItems.length > 0) {
    sections.push({ type: currentSection, items: currentItems });
  }

  return sections;
}

function MarkdownContent({ content }: { content: string }) {
  const sections = parseMarkdown(content);

  return (
    <div className="space-y-5">
      {sections.map((section, sIdx) => (
        <div key={sIdx}>
          {section.type && (
            <h4 className="font-semibold text-gray-900 text-sm mb-2 uppercase tracking-wide">{section.type}</h4>
          )}
          <div className="space-y-1.5 ml-0">
            {section.items.map((item, iIdx) => {
              if (item.type === 'checkbox') {
                return (
                  <div key={iIdx} className="flex items-start gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={item.checked}
                      disabled
                      className="mt-0.5 rounded w-4 h-4"
                    />
                    <span className={item.checked ? 'line-through text-gray-400' : ''}>{item.text}</span>
                  </div>
                );
              } else if (item.type === 'numbered') {
                return (
                  <div key={iIdx} className="flex gap-2 text-sm text-gray-700">
                    <span className="font-semibold flex-shrink-0">{iIdx + 1}.</span>
                    <span>{item.text}</span>
                  </div>
                );
              } else if (item.type === 'bullet') {
                return (
                  <div key={iIdx} className="flex gap-2 text-sm text-gray-700">
                    <span className="font-semibold flex-shrink-0">•</span>
                    <span>{item.text}</span>
                  </div>
                );
              } else {
                return (
                  <p key={iIdx} className="text-sm text-gray-700">
                    {item.text}
                  </p>
                );
              }
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function HuddleSummaryViewer({ summaries }: Props) {
  if (summaries.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-900 text-lg">Daily Huddle Summaries</h3>
      {summaries.map((s, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4 pb-4 border-b">
            <span
              className={`px-2.5 py-1 rounded text-xs font-semibold ${
                s.type === 'md'
                  ? 'bg-purple-100 text-purple-700'
                  : s.type === 'docx'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-red-100 text-red-700'
              }`}
            >
              {s.type.toUpperCase()}
            </span>
            <span className="text-sm font-medium text-gray-700">{s.filename}</span>
            <span className="text-xs text-gray-400 ml-auto">
              {new Date(s.uploadedAt).toLocaleDateString('en-IN')} {new Date(s.uploadedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          {s.type === 'md' ? (
            <MarkdownContent content={s.content} />
          ) : s.type === 'docx' ? (
            <div className="prose prose-sm max-w-none text-gray-700" dangerouslySetInnerHTML={{ __html: s.content }} />
          ) : (
            <p className="text-sm text-gray-600 italic">{s.content}</p>
          )}
        </div>
      ))}
    </div>
  );
}
