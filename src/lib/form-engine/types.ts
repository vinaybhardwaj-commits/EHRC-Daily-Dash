// src/lib/form-engine/types.ts
// Smart Form Engine — Core Type System
// 16 field types, conditional logic, smart defaults, response piping, file upload, repeater, validation

/* ── Field Types ─────────────────────────────────────────────────── */

export type SmartFieldType =
  | 'text'
  | 'number'
  | 'paragraph'
  | 'radio'
  | 'dropdown'
  | 'multi-select'
  | 'toggle'
  | 'currency'
  | 'rating'
  | 'traffic-light'
  | 'date'
  | 'time'
  | 'file'
  | 'repeater'
  | 'person-picker'
  | 'computed';

/* ── Condition System ────────────────────────────────────────────── */

export type ConditionOperator =
  | 'eq' | 'neq'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'in' | 'not_in'
  | 'is_empty' | 'is_not_empty'
  | 'contains' | 'not_contains';

export interface Condition {
  field: string;               // field ID to check
  operator: ConditionOperator;
  value?: string | number | boolean | string[];
}

export interface ConditionGroup {
  logic: 'and' | 'or';
  conditions: (Condition | ConditionGroup)[];
}

export type ConditionRule = Condition | ConditionGroup;

/* ── Response Piping ─────────────────────────────────────────────── */

// Pipe syntax: {{fieldId}} in any string property (label, description, placeholder, options)
// At render time, {{fieldId}} is replaced with the current value of that field.
// Supports formatters: {{fieldId|currency}}, {{fieldId|uppercase}}, {{fieldId|number}}
export type PipeFormatter = 'currency' | 'uppercase' | 'lowercase' | 'number' | 'date' | 'default';

export interface PipeToken {
  raw: string;           // e.g., "{{deaths}}" or "{{deaths|currency}}"
  fieldId: string;       // e.g., "deaths"
  formatter?: PipeFormatter;
}

/* ── Validation ──────────────────────────────────────────────────── */

export interface FieldValidation {
  min?: number;
  max?: number;
  step?: number | 'any';  // HTML5 step attribute for number inputs
  minLength?: number;
  maxLength?: number;
  pattern?: string;        // regex string
  patternMessage?: string; // custom error message for pattern mismatch
  customMessage?: string;  // override default "required" message
}

/* ── Smart Defaults ──────────────────────────────────────────────── */

export type SmartDefaultType =
  | 'today'                  // pre-fill with today's date
  | 'yesterday_value'        // pre-fill from yesterday's submission for this field
  | 'cumulative_mtd'         // yesterday's value + today's entry
  | 'static'                 // a fixed default value
  | 'computed';              // computed from other fields via expression

export interface SmartDefault {
  type: SmartDefaultType;
  value?: string | number;   // for 'static' type
  expression?: string;       // for 'computed' type, e.g., "{{totalRevenueMtd}} + {{todayRevenue}}"
  sourceField?: string;      // for 'yesterday_value' / 'cumulative_mtd', the field to look up
  editable?: boolean;        // whether user can override the default (default: true)
}

/* ── File Upload Config ──────────────────────────────────────────── */

export interface FileUploadConfig {
  maxFiles?: number;         // default 1
  maxSizeMB?: number;        // default 10
  accept?: string[];         // MIME types, e.g., ['application/pdf', 'image/*']
  acceptLabel?: string;      // display text, e.g., "PDF files only"
}

/* ── Repeater Config ─────────────────────────────────────────────── */

export interface RepeaterConfig {
  minRows?: number;
  maxRows?: number;
  fields: SmartFormField[];  // nested fields for each row
  addLabel?: string;         // e.g., "Add another critical value"
  emptyMessage?: string;     // shown when no rows
}

/* ── Traffic Light Config ────────────────────────────────────────── */

export interface TrafficLightConfig {
  options?: { value: string; label: string; color: string }[];
  allowNotes?: boolean;      // show optional text input alongside
  notesLabel?: string;       // e.g., "Details (optional)"
}

/* ── Rating Config ───────────────────────────────────────────────── */

export interface RatingConfig {
  maxStars?: number;         // default 5
  step?: number;             // default 1, can be 0.5
  labels?: string[];         // e.g., ["Poor", "Fair", "Good", "Very Good", "Excellent"]
}

/* ── Currency Config ─────────────────────────────────────────────── */

export interface CurrencyConfig {
  symbol?: string;           // default '₹'
  format?: 'indian' | 'international';  // default 'indian' (lakhs/crores)
  decimals?: number;         // default 0
}

/* ── Person Picker Config ────────────────────────────────────────── */

export interface PersonPickerConfig {
  source?: 'roster' | 'static';  // roster = from DB, static = from options list
  multiple?: boolean;
  options?: string[];             // for static source
}

/* ── Core Field Definition ───────────────────────────────────────── */

export interface SmartFormField {
  id: string;
  label: string;
  description?: string;
  placeholder?: string;
  type: SmartFieldType;
  required?: boolean;

  // Conditional logic
  showWhen?: ConditionRule;       // show this field only when condition is met
  requireWhen?: ConditionRule;    // make required only when condition is met

  // Validation
  validation?: FieldValidation;

  // Smart defaults
  smartDefault?: SmartDefault;

  // Type-specific config
  options?: string[];             // for radio, dropdown, multi-select
  fileConfig?: FileUploadConfig;
  repeaterConfig?: RepeaterConfig;
  trafficLightConfig?: TrafficLightConfig;
  ratingConfig?: RatingConfig;
  currencyConfig?: CurrencyConfig;
  personPickerConfig?: PersonPickerConfig;

  // Computed field expression
  computeExpression?: string;     // e.g., "{{fieldA}} + {{fieldB}}"

  // Response piping — any string prop can contain {{fieldId}} tokens
  // The engine resolves these at render time. This flag is auto-detected.
  _hasPipes?: boolean;
}

/* ── Section Definition ──────────────────────────────────────────── */

export interface SmartFormSection {
  id: string;
  title: string;
  description?: string;
  fields: SmartFormField[];
  showWhen?: ConditionRule;       // conditionally show entire section
}

/* ── Form Layout ─────────────────────────────────────────────────── */

export type FormLayout = 'scroll' | 'wizard' | 'responsive';
// 'responsive' = scroll on desktop (>= 640px), wizard on mobile (< 640px). HOD can flip with the header toggle.

/* ── Top-Level Form Config ───────────────────────────────────────── */

export interface SmartFormConfig {
  slug: string;
  title: string;
  department: string;
  description: string;
  layout: FormLayout;
  sections: SmartFormSection[];

  // Metadata
  version?: number;
  lastModified?: string;

  // Legacy compatibility
  _isLegacy?: boolean;           // true if converted from form-definitions.ts
  _legacyTab?: string;           // original Google Sheets tab name
  _legacyKpiFields?: string[];   // KPI fields from legacy form
}

/* ── Form Analytics Event Types ──────────────────────────────────── */

export type AnalyticsEventType =
  | 'form_start'        // user opened the form
  | 'field_focus'        // user focused a field
  | 'field_blur'         // user left a field (captures time spent)
  | 'section_enter'      // user reached a section (wizard: step change, scroll: viewport)
  | 'form_submit'        // successful submission
  | 'form_abandon'       // user left without submitting
  | 'validation_error';  // validation failed on submit attempt

export interface AnalyticsEvent {
  type: AnalyticsEventType;
  formSlug: string;
  sessionId: string;           // unique per form-fill session
  timestamp: number;           // Date.now()
  fieldId?: string;
  sectionId?: string;
  durationMs?: number;         // for field_blur: time spent on field
  metadata?: Record<string, string | number | boolean>;
}

/* ── Form Analytics Summary (returned by API) ────────────────────── */

export interface FormAnalyticsSummary {
  formSlug: string;
  period: string;              // e.g., "2026-04" or "2026-04-03"
  totalStarts: number;
  totalSubmissions: number;
  totalAbandons: number;
  completionRate: number;      // submissions / starts * 100
  avgCompletionTimeMs: number;
  medianCompletionTimeMs: number;
  fieldStats: FieldAnalytics[];
  sectionStats: SectionAnalytics[];
  dropOffPoints: DropOffPoint[];
}

export interface FieldAnalytics {
  fieldId: string;
  fieldLabel: string;
  avgTimeMs: number;
  focusCount: number;
  blurCount: number;
  validationErrorCount: number;
  skipRate: number;            // % of sessions where field was left empty
}

export interface SectionAnalytics {
  sectionId: string;
  sectionTitle: string;
  reachRate: number;           // % of sessions that reached this section
  avgTimeMs: number;
}

export interface DropOffPoint {
  fieldId: string;
  fieldLabel: string;
  sectionId: string;
  dropOffCount: number;
  dropOffRate: number;         // % of abandons that happened at this field
}
