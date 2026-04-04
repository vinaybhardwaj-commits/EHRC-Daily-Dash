'use client';

import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, Send, CheckCircle, AlertTriangle, AlertCircle, Info, X, ChevronDown, ChevronUp, Shield, Zap, Terminal, Loader2 } from 'lucide-react';

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
  isGM?: boolean;       // If true, shows GM moderator controls
  conversationId?: number | null; // Allow passing in existing conversation ID
}

/* ── Severity helpers ────────────────────────────────────────────── */

const severityConfig = {
  critical: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', badge: 'bg-red-100 text-red-700' },
  high:     { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700' },
  medium:   { icon: Info, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700' },
  low:      { icon: Info, color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200', badge: 'bg-gray-100 text-gray-600' },
};

const severityOptions: Array<{ value: string; label: string }> = [
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

/* ── Component ───────────────────────────────────────────────────── */

export default function FormChat({ slug, date, formData, sessionId, onClose, isGM = false, conversationId: initialConvId }: FormChatProps) {
  const [loading, setLoading] = useState(true);
  const [hasQuestions, setHasQuestions] = useState(false);
  const [questions, setQuestions] = useState<FormQuestion[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(initialConvId ?? null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // GM moderator state
  const [gmText, setGmText] = useState('');
  const [gmSeverity, setGmSeverity] = useState('high');
  const [gmSending, setGmSending] = useState(false);

  // Cross-dept context
  const [crossDeptAlerts, setCrossDeptAlerts] = useState<Array<{
    pattern_name: string;
    severity: string;
    other_depts: string[];
    insight: string;
  }>>([]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Fetch cross-dept context ──
  useEffect(() => {
    async function fetchCrossDept() {
      try {
        const res = await fetch(`/api/ai-questions/cross-dept-context?slug=${slug}&date=${date}`);
        const data = await res.json();
        if (data.crossDeptAlerts && data.crossDeptAlerts.length > 0) {
          setCrossDeptAlerts(data.crossDeptAlerts);
        }
      } catch {
        // Silently fail — non-critical feature
      }
    }
    fetchCrossDept();
  }, [slug, date]);

  // ── Load conversation: trigger detection (dept head) or fetch existing (GM) ──
  useEffect(() => {
    async function load() {
      try {
        if (isGM && initialConvId) {
          // GM mode: just fetch the existing conversation thread
          const res = await fetch(`/api/ai-questions?slug=${slug}&date=${date}`);
          const data = await res.json();
          if (data.conversation) {
            setHasQuestions(true);
            setConversationId(data.conversation.id);
            setMessages(data.conversation.messages || []);
            setQuestions(data.conversation.questions || []);
          }
        } else if (isGM && !initialConvId) {
          // GM mode without existing conversation — check if one exists
          const res = await fetch(`/api/ai-questions?slug=${slug}&date=${date}`);
          const data = await res.json();
          if (data.conversation) {
            setHasQuestions(true);
            setConversationId(data.conversation.id);
            setMessages(data.conversation.messages || []);
            setQuestions(data.conversation.questions || []);
          }
          // Even if no conversation exists, GM can still create one
          setHasQuestions(true);
        } else {
          // Department head mode: trigger anomaly detection
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
            setMessages(
              (data.questions || []).map((q: FormQuestion, i: number) => ({
                id: `q-${i}`,
                role: 'assistant' as const,
                content: q.text,
                metadata: { severity: q.severity, rule_id: q.source_rule_id },
              }))
            );
          }
        }
      } catch (err) {
        console.error('FormChat load error:', err);
        setError('Could not load conversation');
        if (isGM) setHasQuestions(true); // GM can always moderate
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [slug, date, formData, sessionId, isGM, initialConvId]);

  // ── Auto-scroll on new messages ──
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Send reply (department head) ──
  async function handleSendReply() {
    if (!replyText.trim() || !conversationId || sending) return;

    const text = replyText.trim();
    setReplyText('');
    setSending(true);

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
        setMessages(prev =>
          prev.map(m => (m.id === tempMsg.id ? { ...data.message } : m))
        );
      }
    } catch (err) {
      console.error('Reply error:', err);
      setError('Failed to send reply');
      setMessages(prev => prev.filter(m => m.id !== tempMsg.id));
      setReplyText(text);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  // ── Send GM question (moderator) ──
  async function handleSendGmQuestion() {
    if (!gmText.trim() || gmSending) return;

    const text = gmText.trim();
    setGmText('');
    setGmSending(true);
    setError(null);

    const tempMsg: ChatMessage = {
      id: `gm-temp-${Date.now()}`,
      role: 'assistant',
      content: text,
      metadata: { severity: gmSeverity, source: 'gm', author: 'GM' },
    };
    setMessages(prev => [...prev, tempMsg]);

    try {
      const res = await fetch('/api/ai-questions/moderate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          date,
          content: text,
          severity: gmSeverity,
          conversationId: conversationId || undefined,
        }),
      });
      const data = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      if (data.message) {
        setMessages(prev =>
          prev.map(m => (m.id === tempMsg.id ? { ...data.message } : m))
        );
      }

      if (data.conversationId && !conversationId) {
        setConversationId(data.conversationId);
      }

      setHasQuestions(true);
    } catch (err) {
      console.error('GM moderate error:', err);
      setError('Failed to send GM question');
      setMessages(prev => prev.filter(m => m.id !== tempMsg.id));
      setGmText(text);
    } finally {
      setGmSending(false);
    }
  }

  // ── Slash command execution ──
  const [commandLoading, setCommandLoading] = useState(false);

  async function handleSlashCommand(text: string) {
    setCommandLoading(true);
    setError(null);

    // Show the command itself as a user message
    const cmdMsg: ChatMessage = {
      id: `cmd-${Date.now()}`,
      role: 'user',
      content: text,
      metadata: { source: 'slash-command' },
    };
    setMessages(prev => [...prev, cmdMsg]);

    // Show a loading placeholder
    const loadingId = `cmd-loading-${Date.now()}`;
    const loadingMsg: ChatMessage = {
      id: loadingId,
      role: 'assistant',
      content: 'Running command...',
      metadata: { source: 'slash-command', loading: true },
    };
    setMessages(prev => [...prev, loadingMsg]);

    try {
      const res = await fetch('/api/ai-questions/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, slug, date }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Command failed');
      }

      const resultMsg: ChatMessage = {
        id: `cmd-result-${Date.now()}`,
        role: 'assistant',
        content: data.response,
        metadata: { source: 'slash-command', command: data.command, ...data.metadata },
      };

      setMessages(prev => prev.filter(m => m.id !== loadingId).concat(resultMsg));
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Command failed';
      setMessages(prev =>
        prev.filter(m => m.id !== loadingId).concat({
          id: `cmd-err-${Date.now()}`,
          role: 'assistant',
          content: `Command error: ${errMsg}`,
          metadata: { source: 'slash-command', error: true },
        })
      );
    } finally {
      setCommandLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (replyText.trim().startsWith('/')) {
        const text = replyText.trim();
        setReplyText('');
        handleSlashCommand(text);
      } else {
        handleSendReply();
      }
    }
  }

  function handleGmKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (gmText.trim().startsWith('/')) {
        const text = gmText.trim();
        setGmText('');
        handleSlashCommand(text);
      } else {
        handleSendGmQuestion();
      }
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

  // ── No questions — clean submission (dept head mode only) ──
  if (!hasQuestions && !isGM) {
    return null;
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
          {questions.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
              {questions.length} follow-up{questions.length !== 1 ? 's' : ''}
            </span>
          )}
          {allAnswered && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Responded
            </span>
          )}
          {isGM && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 flex items-center gap-1">
              <Shield className="w-3 h-3" /> GM Mode
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
              {isGM
                ? 'GM Moderator view — you can add follow-up questions to this thread.'
                : 'We noticed a few things in your submission that may need clarification. Your responses help the GM prepare for the morning meeting.'}
            </p>

            {/* Cross-department context alerts */}
            {crossDeptAlerts.length > 0 && (
              <div className="space-y-1.5">
                {crossDeptAlerts.map((alert, i) => {
                  const DEPT_DISPLAY: Record<string, string> = {
                    'customer-care': 'Customer Care', 'emergency': 'Emergency', 'patient-safety': 'Patient Safety',
                    'finance': 'Finance', 'billing': 'Billing', 'clinical-lab': 'Clinical Lab', 'pharmacy': 'Pharmacy',
                    'supply-chain': 'Supply Chain', 'facility': 'Facility', 'nursing': 'Nursing', 'radiology': 'Radiology',
                    'ot': 'OT', 'hr-manpower': 'HR & Manpower', 'diet': 'Diet', 'training': 'Training',
                    'biomedical': 'Biomedical', 'it': 'IT',
                  };
                  const otherNames = alert.other_depts.map(d => DEPT_DISPLAY[d] || d).join(', ');
                  const isCritical = alert.severity === 'critical';
                  return (
                    <div
                      key={i}
                      className={`flex items-start gap-2 text-xs px-3 py-2 rounded-lg border ${
                        isCritical
                          ? 'bg-red-50 border-red-200 text-red-700'
                          : 'bg-purple-50 border-purple-200 text-purple-700'
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold">{alert.pattern_name}:</span>{' '}
                        Also flagged in {otherNames}.
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {messages.length === 0 && isGM && (
              <p className="text-xs text-gray-400 text-center italic py-4">
                No AI questions were generated for this submission. You can add your own below.
              </p>
            )}

            {messages.map((msg) => {
              const isAssistant = msg.role === 'assistant';
              const isGmMsg = msg.metadata?.source === 'gm';
              const isCmd = msg.metadata?.source === 'slash-command';
              const isCmdLoading = isCmd && msg.metadata?.loading;
              const isCmdError = isCmd && msg.metadata?.error;
              const severity = (msg.metadata?.severity as string) || 'medium';
              const sConf = severityConfig[severity as keyof typeof severityConfig] || severityConfig.medium;
              const Icon = isCmd ? Terminal : isGmMsg ? Shield : sConf.icon;

              // Slash command user messages (the typed command)
              if (!isAssistant && isCmd) {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-gray-800 text-green-300 font-mono">
                      {msg.content}
                    </div>
                  </div>
                );
              }

              // Slash command responses (assistant)
              if (isAssistant && isCmd) {
                return (
                  <div key={msg.id} className="flex justify-start">
                    <div className={`max-w-[90%] rounded-lg px-4 py-3 text-sm border ${
                      isCmdError
                        ? 'bg-red-50 border-red-200'
                        : isCmdLoading
                          ? 'bg-gray-50 border-gray-200'
                          : 'bg-teal-50 border-teal-200'
                    }`}>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        {isCmdLoading ? (
                          <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />
                        ) : (
                          <Terminal className={`w-3.5 h-3.5 ${isCmdError ? 'text-red-500' : 'text-teal-600'}`} />
                        )}
                        <span className={`text-[10px] font-medium uppercase ${
                          isCmdError ? 'text-red-600' : isCmdLoading ? 'text-gray-400' : 'text-teal-600'
                        }`}>
                          {isCmdLoading ? 'Running...' : isCmdError ? 'Error' : `/${msg.metadata?.command || 'command'}`}
                        </span>
                      </div>
                      <div className="text-gray-800 leading-relaxed whitespace-pre-wrap">
                        {msg.content}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={msg.id}
                  className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      isAssistant
                        ? isGmMsg
                          ? 'bg-purple-50 border-purple-200 border'
                          : `${sConf.bg} ${sConf.border} border`
                        : 'bg-blue-600 text-white'
                    }`}
                  >
                    {isAssistant && (
                      <div className="flex items-center gap-1.5 mb-1">
                        <Icon className={`w-3.5 h-3.5 ${isGmMsg ? 'text-purple-600' : sConf.color}`} />
                        <span className={`text-[10px] font-medium uppercase ${isGmMsg ? 'text-purple-600' : sConf.color}`}>
                          {isGmMsg ? 'GM' : severity}
                        </span>
                        {isGmMsg && (
                          <span className={`text-[10px] font-medium uppercase ${sConf.color} ml-1`}>
                            · {severity}
                          </span>
                        )}
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

          {/* GM Moderator input (only shown in GM mode) */}
          {isGM && (
            <div className="border-t border-purple-100 px-4 py-3 bg-purple-50/30">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-3.5 h-3.5 text-purple-600" />
                <span className="text-xs font-semibold text-purple-700 uppercase">GM Question</span>
                <select
                  value={gmSeverity}
                  onChange={(e) => setGmSeverity(e.target.value)}
                  className="ml-auto text-xs border border-purple-200 rounded px-2 py-0.5 bg-white text-purple-700 focus:outline-none focus:ring-1 focus:ring-purple-400"
                >
                  {severityOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 items-end">
                <textarea
                  value={gmText}
                  onChange={(e) => setGmText(e.target.value)}
                  onKeyDown={handleGmKeyDown}
                  placeholder="Ask a follow-up question as GM..."
                  rows={2}
                  className="flex-1 resize-none rounded-lg border border-purple-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
                />
                <button
                  onClick={() => {
                    if (gmText.trim().startsWith('/')) {
                      const text = gmText.trim();
                      setGmText('');
                      handleSlashCommand(text);
                    } else {
                      handleSendGmQuestion();
                    }
                  }}
                  disabled={!gmText.trim() || gmSending || commandLoading}
                  className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[10px] text-purple-400 mt-1">
                This question will appear in the department head&apos;s thread · Type /help for commands
              </p>
            </div>
          )}

          {/* Reply input (department head mode, or GM can also reply) */}
          {(!isGM || (isGM && messages.some(m => m.role === 'user'))) ? null : null}
          {!isGM && (
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
                  onClick={() => {
                    if (replyText.trim().startsWith('/')) {
                      const text = replyText.trim();
                      setReplyText('');
                      handleSlashCommand(text);
                    } else {
                      handleSendReply();
                    }
                  }}
                  disabled={!replyText.trim() || sending || commandLoading}
                  className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                Press Enter to send · Shift+Enter for new line · Type /help for commands
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
