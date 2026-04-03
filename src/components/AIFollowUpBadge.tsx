'use client';

import React, { useState, useEffect } from 'react';
import { MessageCircle, AlertCircle, CheckCircle } from 'lucide-react';

interface PendingConversation {
  id: number;
  form_slug: string;
  date: string;
  status: 'open' | 'answered';
  questions: Array<{ severity: string }>;
}

interface AIFollowUpBadgeProps {
  month?: string; // YYYY-MM
}

const DEPT_NAMES: Record<string, string> = {
  'customer-care': 'Customer Care',
  'emergency': 'Emergency',
  'patient-safety': 'Patient Safety',
  'finance': 'Finance',
  'billing': 'Billing',
  'clinical-lab': 'Clinical Lab',
  'pharmacy': 'Pharmacy',
  'supply-chain': 'Supply Chain',
  'facility': 'Facility',
  'nursing': 'Nursing',
  'radiology': 'Radiology',
  'ot': 'OT',
  'hr-manpower': 'HR & Manpower',
  'diet': 'Diet',
  'training': 'Training',
  'biomedical': 'Biomedical',
  'it': 'IT',
};

export default function AIFollowUpBadge({ month }: AIFollowUpBadgeProps) {
  const [conversations, setConversations] = useState<PendingConversation[]>([]);
  const [counts, setCounts] = useState({ open: 0, answered: 0, total: 0 });
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPending() {
      try {
        const params = month ? `?month=${month}` : '';
        const res = await fetch(`/api/ai-questions/pending${params}`);
        const data = await res.json();
        setConversations(data.conversations || []);
        setCounts(data.counts || { open: 0, answered: 0, total: 0 });
      } catch {
        // Graceful fallback
      } finally {
        setLoading(false);
      }
    }
    fetchPending();
  }, [month]);

  if (loading || counts.total === 0) return null;

  return (
    <div className="mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-xl px-5 py-3 hover:from-indigo-100 hover:to-blue-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <MessageCircle className="w-5 h-5 text-indigo-600" />
          <span className="text-sm font-semibold text-gray-800">AI Follow-ups</span>
          {counts.open > 0 && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
              <AlertCircle className="w-3 h-3" />
              {counts.open} awaiting response
            </span>
          )}
          {counts.answered > 0 && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
              <CheckCircle className="w-3 h-3" />
              {counts.answered} responded
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400">
          {expanded ? '\u25B2' : '\u25BC'}
        </span>
      </button>

      {expanded && conversations.length > 0 && (
        <div className="mt-2 bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
          {conversations.map(conv => (
            <div key={conv.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50">
              <div className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${conv.status === 'open' ? 'bg-red-400' : 'bg-green-400'}`} />
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {DEPT_NAMES[conv.form_slug] || conv.form_slug}
                  </p>
                  <p className="text-xs text-gray-500">{conv.date}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">
                  {(conv.questions || []).length} question{(conv.questions || []).length !== 1 ? 's' : ''}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  conv.status === 'open'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-green-100 text-green-700'
                }`}>
                  {conv.status === 'open' ? 'Pending' : 'Responded'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
