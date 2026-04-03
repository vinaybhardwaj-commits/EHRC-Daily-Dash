'use client';

import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, Send, CheckCircle, AlertTriangle, AlertCircle, Info, X, ChevronDown, ChevronUp } from 'lucide-react';

/* ── Types (client-side subset) ──────────────────────────────────── */

interface FormQuestion {
  id: string;
  text: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  related_fields: string[];
  source_rule_id: string;
}

interface ChatMessage {
  id: number | string;
  role: 'assistant' | 'user';
  content: string;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
}

interface FormChatProps {
  slug: string;
  date: string;
  formData: Record<string, unknown>;
  sessionId?: string;
  onClose?: () => void;
}

/* ── Severity helpers ────────────────────────────────────────────── */

const severityConfig = {
  critical: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', badge: 'bg-red-100 text-red-700' },
  high:     { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700' },
  medium:   { icon: Info, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700' },
  low:      { icon: Info, color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200', badge: 'bg-gray-100 text-gray-600' },
};

/* ── Component ───────────────────────────────────────────────────── */

export default function FormChat({ slug, date, formData, sessionId, onClose }: FormChatProps) {
  const [loading, setLoading] = useState(true);
  const [hasQuestions, setHasQuestions] = useState(false);
  const [questions, setQuestions] = useState<FormQuestion[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Trigger anomaly detection on mount ──
  useEffect(() => {
    async function triggerDetection() {
      try {
        const res = await fetch('/api/ai-questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, date, formData, sessionId }),
        });
        const data = await res.json();

        if (data.hasQuestions) {
          setHasQuestions(true);
          setQuestions(data.questions || []);
          setConversationId(data.conversationId);
          // Convert questions to initial assistant messages
          setMessages(
            (data.questions || []).map((q: FormQuestion, i: number) => ({
              id: `q-${i}`,
              role: 'assistant' as const,
              content: q.text,
              metadata: { severity: q.severity, rule_id: q.source_rule_id },
            }))
          );
        }
      } catch (err) {
        console.error('FormChat detection error:', err);
        setError('Could not check for follow-up questions');
      } finally {
        setLoading(false);
      }
    }

    triggerDetection();
  }, [slug, date, formData, sessionId]);

  // ── Auto-scroll on new messages ──
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Send reply ──
  async function handleSendReply() {
    if (!replyText.trim() || !conversationId || sending) return;

    const text = replyText.trim();
    setReplyText('');
    setSending(true);

    // Optimistic UI update
    const tempMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: text,
    };
    setMessages(prev => [...prev, tempMsg]);

    try {
      const res = await fetch('/api/ai-questions/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, content: text }),
      });
      const data = await res.json();

      if (data.message) {
        // Replace temp message with real one
        setMessages(prev =>
          prev.map(m => (m.id === tempMsg.id ? { ...data.message } : m))
        );
      }
    } catch (err) {
      console.error('Reply error:', err);
      setError('Failed to send reply');
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m.id !== tempMsg.id));
      setReplyText(text); // Restore text
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendReply();
    }
  }

  // ── Loading state ──
  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 mt-4 animate-pulse">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-5 h-5 bg-gray-200 rounded-full" />
          <div className="h-4 bg-gray-200 rounded w-48" />
        </div>
        <div className="space-y-2">
          <div className="h-3 bg-gray-100 rounded w-full" />
          <div className="h-3 bg-gray-100 rounded w-3/4" />
        </div>
      </div>
    );
  }

  // ── No questions — clean submission ──
  if (!hasQuestions) {
    return null; // Don't render anything if no anomalies
  }

  // ── Chat panel ──
  const allAnswered = messages.some(m => m.role === 'user');

  return (
    <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-100 hover:from-blue-100 hover:to-indigo-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-semibold text-gray-800">
            EHRC AI Assistant
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
            {questions.length} follow-up{questions.length !== 1 ? 's' : ''}
          </span>
          {allAnswered && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Responded
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onClose && (
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="p-1 hover:bg-gray-200 rounded"
            >
              <X className="w-4 h-4 text-gray-400" />
            </span>
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {/* Chat body */}
      {expanded && (
        <div className="flex flex-col">
          {/* Messages */}
          <div className="px-4 py-3 space-y-3 max-h-[400px] overflow-y-auto">
            {/* Intro text */}
            <p className="text-xs text-gray-500 text-center py-1">
              We noticed a few things in your submission that may need clarification.
              Your responses help the GM prepare for the morning meeting.
            </p>

            {messages.map((msg) => {
              const isAssistant = msg.role === 'assistant';
              const severity = (msg.metadata?.severity as string) || 'medium';
              const sConf = severityConfig[severity as keyof typeof severityConfig] || severityConfig.medium;
              const Icon = sConf.icon;

              return (
                <div
                  key={msg.id}
                  className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      isAssistant
                        ? `${sConf.bg} ${sConf.border} border`
                        : 'bg-blue-600 text-white'
                    }`}
                  >
                    {isAssistant && (
                      <div className="flex items-center gap-1.5 mb-1">
                        <Icon className={`w-3.5 h-3.5 ${sConf.color}`} />
                        <span className={`text-[10px] font-medium uppercase ${sConf.color}`}>
                          {severity}
                        </span>
                      </div>
                    )}
                    <p className={`leading-relaxed ${isAssistant ? 'text-gray-800' : 'text-white'}`}>
                      {msg.content}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>

          {error && (
            <div className="mx-4 mb-2 text-xs text-red-600 bg-red-50 px-3 py-1.5 rounded">
              {error}
            </div>
          )}

          {/* Reply input */}
          <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your response..."
                rows={2}
                className="flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              />
              <button
                onClick={handleSendReply}
                disabled={!replyText.trim() || sending}
                className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              Press Enter to send \u00b7 Shift+Enter for new line
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
