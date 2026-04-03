/* ──────────────────────────────────────────────────────────────────
   AI Question Engine — Core Type System
   Phase 1: Rubric-based anomaly detection + template questions
   ────────────────────────────────────────────────────────────────── */

// ── Rubric Types ──

export type RuleSeverity = 'critical' | 'high' | 'medium' | 'low';

export type RuleType =
  | 'threshold'      // Single field above/below expected range
  | 'cross_field'    // Contradiction between two fields
  | 'historical'     // Deviation from rolling average
  | 'pattern'        // Text field matches/doesn't match regex
  | 'missing';       // Required field empty when trigger field has a value

export type ThresholdOperator = 'gt' | 'lt' | 'eq' | 'neq' | 'gte' | 'lte' | 'between' | 'outside';
export type CrossFieldRelation = 'a_implies_b' | 'a_excludes_b' | 'a_gt_b' | 'sum_exceeds';

export interface ThresholdCondition {
  field: string;
  operator: ThresholdOperator;
  value: number | string | [number, number];
}

export interface CrossFieldCondition {
  field_a: string;
  field_b: string;
  relationship: CrossFieldRelation;
  threshold?: number; // For sum_exceeds
}

export interface HistoricalCondition {
  field: string;
  deviation_pct: number;       // e.g., 40 = flag if 40% above/below avg
  lookback_days: number;       // e.g., 7
  direction?: 'drop' | 'spike' | 'both'; // default: both
}

export interface PatternCondition {
  field: string;
  pattern: string;             // regex
  invert: boolean;             // true = flag when pattern NOT matched
}

export interface MissingCondition {
  trigger_field: string;
  trigger_operator: ThresholdOperator;
  trigger_value: number | string;
  required_field: string;
}

export type RuleCondition =
  | { type: 'threshold'; config: ThresholdCondition }
  | { type: 'cross_field'; config: CrossFieldCondition }
  | { type: 'historical'; config: HistoricalCondition }
  | { type: 'pattern'; config: PatternCondition }
  | { type: 'missing'; config: MissingCondition };

export interface AnomalyRule {
  id: string;
  name: string;
  description: string;
  severity: RuleSeverity;
  condition: RuleCondition;
  question_template: string;   // Fallback template with {fieldId} placeholders
  context_fields: string[];    // Fields to include in LLM prompt
  enabled: boolean;
}

export interface DepartmentContext {
  department_name: string;
  typical_daily_volume: string;
  key_concerns: string[];
  historical_context: string;
}

export interface DepartmentRubric {
  slug: string;
  version: string;
  rules: AnomalyRule[];
  context: DepartmentContext;
}

// ── Anomaly Detection Output ──

export interface DetectedAnomaly {
  rule_id: string;
  rule_name: string;
  severity: RuleSeverity;
  triggered_values: Record<string, unknown>;
  historical_values?: number[];
  historical_avg?: number;
  deviation_pct?: number;
  fallback_question: string;
}

// ── Question Types ──

export interface FormQuestion {
  id: string;
  text: string;
  severity: RuleSeverity;
  related_fields: string[];
  source_rule_id: string;
}

// ── Conversation Types ──

export type ConversationStatus = 'open' | 'answered' | 'resolved' | 'expired';
export type MessageRole = 'assistant' | 'user';

export interface ConversationMessage {
  id: number;
  conversation_id: number;
  role: MessageRole;
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface FormConversation {
  id: number;
  form_slug: string;
  date: string;
  session_id: string | null;
  status: ConversationStatus;
  anomalies_detected: DetectedAnomaly[];
  questions: FormQuestion[];
  messages: ConversationMessage[];
  created_at: string;
  resolved_at: string | null;
}

// ── LLM Adapter Interface ──

export interface LLMAdapter {
  generateQuestions(
    anomalies: DetectedAnomaly[],
    rubric: DepartmentRubric,
    formData: Record<string, unknown>
  ): Promise<FormQuestion[]>;
  isAvailable(): Promise<boolean>;
}
