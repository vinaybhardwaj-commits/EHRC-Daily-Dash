'use client';

import { HuddleSummary } from '@/lib/types';

interface Props {
  summaries: HuddleSummary[];
}

function parseMarkdown(content: string) {
  const lines = content.split('\n');
  const sections: { type: string | null; items: { type: string; text: string; checked?: boolean }[] }[] = [];
  let currentSection: string | null = null;
  let currentItems: { type: string; text: string; checked?: boolean }[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.match(/^#+\s/)) {
      if (currentSection !== null && currentItems.length > 0) {
        sections.push({ type: currentSection, items: currentItems });
        currentItems = [];
      }
      currentSection = trimmed.replace(/^#+\s/, '').trim();
      continue;
    }
    if (trimmed.match(/^\[[\sx]\]\s/)) {
      const isChecked = trimmed.includes('[x]') || trimmed.includes('[X]');
      const text = trimmed.replace(/^\[[\sx]\]\s/, '').trim();
      currentItems.push({ type: 'checkbox', text, checked: isChecked });
      continue;
    }
    if (trimmed.match(/^\d+\.\s/)) {
      currentItems.push({ type: 'numbered', text: trimmed.replace(/^\d+\.\s/, '').trim() });
      continue;
    }
    if (trimmed.match(/^\*\*.*\*\*:?$|^__.*__:?$/)) {
      if (currentItems.length > 0) {
        sections.push({ type: currentSection, items: currentItems });
        currentItems = [];
      }
      currentSection = trimmed.replace(/\*\*|__/g, '').replace(/:$/, '').trim();
      continue;
    }
    if (trimmed.match(/^[-*+]\s/)) {
      currentItems.push({ type: 'bullet', text: trimmed.replace(/^[-*+]\s/, '').trim() });
      continue;
    }
    if (trimmed) {
      currentItems.push({ type: 'text', text: trimmed });
    }
  }
  if (currentItems.length > 0) {
    sections.push({ type: currentSection, items: currentItems });
  }
  return sections;
}

function MarkdownContent({ content }: { content: string }) {
  const sections = parseMarkdown(content);
  return (
    <div className="space-y-4">
      {sections.map((section, sIdx) => (
        <div key={sIdx}>
          {section.type && (
            <h4 className="font-semibold text-slate-800 text-sm mb-2">{section.type}</h4>
          )}
          <div className="space-y-1.5">
            {section.items.map((item, iIdx) => {
              if (item.type === 'checkbox') {
                return (
                  <div key={iIdx} className="flex items-start gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={item.checked} disabled className="mt-0.5 rounded w-4 h-4 accent-blue-600" />
                    <span className={item.checked ? 'line-through text-slate-400' : ''}>{item.text}</span>
                  </div>
                );
              } else if (item.type === 'bullet') {
                return (
                  <div key={iIdx} className="flex gap-2 text-sm text-slate-700">
                    <span className="text-slate-400 flex-shrink-0">-</span>
                    <span>{item.text}</span>
                  </div>
                );
              } else {
                return <p key={iIdx} className="text-sm text-slate-700">{item.text}</p>;
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
      <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wider">Huddle Summaries</h3>
      {summaries.map((s, i) => (
        <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-100">
            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
              s.type === 'md' ? 'bg-purple-100 text-purple-700'
                : s.type === 'docx' ? 'bg-blue-100 text-blue-700'
                : 'bg-red-100 text-red-700'
            }`}>
              {s.type.toUpperCase()}
            </span>
            <span className="text-sm font-medium text-slate-700 truncate">{s.filename}</span>
            <span className="text-xs text-slate-400 ml-auto whitespace-nowrap">
              {new Date(s.uploadedAt).toLocaleDateString('en-IN')}
            </span>
          </div>
          {s.type === 'md' ? (
            <MarkdownContent content={s.content} />
          ) : s.type === 'docx' ? (
            <div className="prose prose-sm max-w-none text-slate-700" dangerouslySetInnerHTML={{ __html: s.content }} />
          ) : (
            <p className="text-sm text-slate-600 italic">{s.content}</p>
          )}
        </div>
      ))}
    </div>
  );
}
