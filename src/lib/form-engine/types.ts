/**
 * EHRC Smart Form Engine — Type Definitions
 *
 * This is the core type system for the SurveyMonkey-like form engine.
 * It supports 14 field types, conditional logic, wizard navigation,
 * smart defaults, file uploads, computed fields, and more.
 *
 * The existing 17 department forms are expressed using these types
 * but currently use only the basic subset (text, number, paragraph, radio).
 * The engine supports the full range — forms will be upgraded incrementally
 * after V confirms changes with department heads.
 */

// ──────────────────────────────────────────────
// Field Types
// ──────────────────────────────────────────────

export type SmartFieldType =
  | 'text'           // Single-line text input
  | 'number'         // Numeric input (integers or decimals)
  | 'currency'       // Currency input with Rs. formatting, lakhs/crore display
  | 'paragraph'      // Multi-line textarea
  | 'radio'          // Single-select radio buttons (good for ≤4 options)
  | 'dropdown'       // Single-select dropdown (good for >4 options)
  | 'multi-select'   // Multi-select checkboxes
  | 'toggle'         // Yes/No or NIL/Not NIL boolean switch
  | 'date'           // Date picker (proper date input, not text)
  | 'time'           // Time picker (for TAT, shift times)
  | 'rating'         // Star/scale rating (e.g., 1–5 stars)
  | 'traffic-light'  // Green/Amber/Red status selector
  | 'person-picker'  // Select from a roster of people (doctors, staff)
  | 'file'           // File upload (PDFs, images, documents)
  | 'repeater'       // Repeatable group of fields (e.g., multiple critical values)
  | 'section';       // Visual section divider (not a real input)

// ──────────────────────────────────────────────
// Conditional Logic
// ──────────────────────────────────────────────

export type ComparisonOperator =
  | 'eq'         // equals
  | 'neq'        // not equals
  | 'gt'         // greater than
  | 'gte'        // greater than or equal
  | 'lt'         // less than
  | 'lte'        // less than or equal
  | 'contains'   // string contains
  | 'not_empty'  // value is not empty/nil/undefined
  | 'is_empty'   // value is empty/nil/undefined
  | 'in'         // value is in a list
  | 'not_in';    // value is not in a list

export interface ConditionRule {
  /** The field ID whose value to check */
  fieldId: string;
  /** The comparison operator */
  operator: ComparisonOperator;
  /** The value to compare against (not needed for is_empty/not_empty) */
  value?: string | number | boolean | string[];
}

export interface ConditionalLogic {
  /** How to combine multiple conditions: 'and' = all must be true, 'or' = any must be true */
  combinator: 'and' | 'or';
  /** The conditions to evaluate */
  conditions: ConditionRule[];
  /** What to do when conditions are met */
  action: 'show' | 'hide' | 'require' | 'optional';
}

// ──────────────────────────────────────────────
// Smart Defaults
// ──────────────────────────────────────────────

export type DefaultSource =
  | { type: 'static'; value: string | number | boolean }
  | { type: 'today' }           // Today's date in DD-MM-YYYY
  | { type: 'now' }             // Current time in HH:MM
  | { type: 'yesterday_value'; fieldId: string }  // Yesterday's value for this field
  | { type: 'computed'; formula: string }          // Computed from other fields (future)
  | { type: 'cumulative'; fieldId: string };       // Running total from previous days

// ──────────────────────────────────────────────
// Validation Rules
// ──────────────────────────────────────────────

export interface ValidationRules {
  min?: number;
  max?: number;
  step?: number | 'any';  // HTML5 step attribute for number inputs
  minLength?: number;
  maxLength?: number;
  pattern?: string;       // Regex pattern
  patternMessage?: string; // Custom error message for pattern validation
  /** Custom validation function name (resolved at runtime) */
  customValidator?: string;
}

// ──────────────────────────────────────────────
// File Upload Config
// ──────────────────────────────────────────────

export interface FileUploadConfig {
  /** Accepted MIME types or extensions */
  accept: string[];
  /** Max file size in MB */
  maxSizeMB: number;
  /** Max number of files */
  maxFiles: number;
  /** Storage bucket name (for Vercel Blob organization) */
  bucket?: string;
}

// ──────────────────────────────────────────────
// Person Picker Config
// ──────────────────────────────────────────────

export interface PersonPickerConfig {
  /** Source roster: 'doctors', 'nurses', 'all-staff', or a custom roster ID */
  roster: string;
  /** Allow multiple selections */
  multiple: boolean;
  /** Allow typing a name not in the roster */
  allowFreeText: boolean;
}

// ──────────────────────────────────────────────
// Repeater Config (for dynamic field groups)
// ──────────────────────────────────────────────

export interface RepeaterConfig {
  /** The fields within each repeated group */
  fields: SmartFormField[];
  /** Minimum number of entries */
  minEntries: number;
  /** Maximum number of entries */
  maxEntries: number;
  /** Label for the "Add" button */
  addLabel: string;
}

// ──────────────────────────────────────────────
// Rating Config
// ──────────────────────────────────────────────

export interface RatingConfig {
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** Step size */
  step: number;
  /** Labels for min and max */
  labels?: { min: string; max: string };
  /** Show as stars, numbers, or slider */
  display: 'stars' | 'numbers' | 'slider';
}

// ──────────────────────────────────────────────
// Traffic Light Config
// ──────────────────────────────────────────────

export interface TrafficLightConfig {
  /** Custom labels for each status (defaults: Green/Amber/Red) */
  labels?: { green: string; amber: string; red: string };
  /** Whether to show a notes field when Amber or Red is selected */
  notesOnNonGreen?: boolean;
  /** Placeholder text for the notes field */
  notesPlaceholder?: string;
}

// ──────────────────────────────────────────────
// The Core Field Definition
// ──────────────────────────────────────────────

export interface SmartFormField {
  /** Unique field identifier (camelCase) */
  id: string;
  /** Display label shown to the user */
  label: string;
  /** Help text shown below the label */
  description?: string;
  /** Tooltip text (shown on hover/tap of info icon) */
  tooltip?: string;
  /** Placeholder text inside the input */
  placeholder?: string;
  /** The field type */
  type: SmartFieldType;
  /** Whether this field is required (can be overridden by conditional logic) */
  required: boolean;

  // --- Type-specific options ---

  /** Options for radio, dropdown, or multi-select fields */
  options?: string[];
  /** Validation rules */
  validation?: ValidationRules;
  /** File upload configuration (for type: 'file') */
  fileConfig?: FileUploadConfig;
  /** Person picker configuration (for type: 'person-picker') */
  personConfig?: PersonPickerConfig;
  /** Repeater configuration (for type: 'repeater') */
  repeaterConfig?: RepeaterConfig;
  /** Rating configuration (for type: 'rating') */
  ratingConfig?: RatingConfig;
  /** Traffic light configuration (for type: 'traffic-light') */
  trafficLightConfig?: TrafficLightConfig;

  // --- Smart behavior ---

  /** Default value or source */
  defaultValue?: DefaultSource;
  /** Conditional visibility/requirement rules */
  conditions?: ConditionalLogic;
  /** Whether the field value should be formatted as currency (Rs.) in display */
  isCurrency?: boolean;
  /** Unit suffix to display (e.g., "min", "Rs.", "%") */
  unit?: string;

  // --- Legacy compatibility ---

  /** Alias for label (populated by enrichment for backward compat) */
  name?: string;
  /** Alias for description (populated by enrichment for backward compat) */
  helper?: string;
}

// ──────────────────────────────────────────────
// Section Definition
// ──────────────────────────────────────────────

export interface SmartFormSection {
  /** Section ID (auto-generated if not provided) */
  id?: string;
  /** Section title */
  title: string;
  /** Section description/instructions */
  description?: string;
  /** Fields within this section */
  fields: SmartFormField[];
  /** Conditional visibility for the entire section */
  conditions?: ConditionalLogic;
  /** Whether this section starts collapsed (for optional sections) */
  collapsible?: boolean;
  /** Whether the section is initially collapsed */
  collapsed?: boolean;
}

// ──────────────────────────────────────────────
// Form Definition
// ──────────────────────────────────────────────

export interface SmartFormConfig {
  /** URL slug for routing (e.g., 'emergency', 'customer-care') */
  slug: string;
  /** Full form title */
  title: string;
  /** Department name */
  department: string;
  /** Form description/instructions */
  description: string;
  /** Form sections containing fields */
  sections: SmartFormSection[];

  // --- Display & navigation ---

  /** How to display the form */
  layout: 'scroll' | 'wizard';
  /** Show progress indicator (for wizard mode) */
  showProgress?: boolean;
  /** Estimated fill time in minutes (shown to user) */
  estimatedMinutes?: number;

  // --- Smart behavior ---

  /** Field IDs to show as KPI cards on the dashboard */
  kpiFields?: string[];
  /** Whether to auto-save form state to localStorage as user fills */
  autoSave?: boolean;
  /** Whether to fetch yesterday's data for pre-fill suggestions */
  fetchYesterdayData?: boolean;

  // --- Legacy compatibility ---

  /** Alias for department (backward compat) */
  name?: string;
  /** Google Sheet tab name (backward compat) */
  tab?: string;
}

// ──────────────────────────────────────────────
// Form State (runtime)
// ──────────────────────────────────────────────

export interface FormFieldValue {
  value: string | number | boolean | string[] | null;
  /** For file uploads: array of uploaded file references */
  files?: UploadedFileRef[];
  /** For repeater fields: array of field group values */
  repeaterEntries?: Record<string, FormFieldValue>[];
}

export interface UploadedFileRef {
  /** Vercel Blob URL */
  url: string;
  /** Original filename */
  filename: string;
  /** MIME type */
  mimeType: string;
  /** File size in bytes */
  size: number;
  /** Upload timestamp */
  uploadedAt: string;
}

export interface SmartFormState {
  /** Current field values keyed by field ID */
  values: Record<string, FormFieldValue>;
  /** Validation errors keyed by field ID */
  errors: Record<string, string>;
  /** Current wizard step index (0-based) */
  currentStep: number;
  /** Whether the form has been submitted */
  submitted: boolean;
  /** Whether submission is in progress */
  submitting: boolean;
  /** Submission error message */
  submitError: string | null;
  /** Whether form data has been modified since last save */
  isDirty: boolean;
}

// ──────────────────────────────────────────────
// Legacy Adapter Types
// ──────────────────────────────────────────────

/**
 * These types allow backward compatibility with the existing
 * form-definitions.ts format. The adapter converts legacy
 * DepartmentForm definitions into SmartFormConfig.
 */

export type LegacyFieldType = 'text' | 'number' | 'paragraph' | 'radio' | 'section';

export interface LegacyFormField {
  id: string;
  label: string;
  name?: string;
  description?: string;
  helper?: string;
  type: LegacyFieldType;
  required: boolean;
  options?: string[];
  validation?: { min?: number; max?: number };
}

export interface LegacyFormSection {
  title: string;
  description?: string;
  fields: LegacyFormField[];
}

export interface LegacyDepartmentForm {
  slug: string;
  title: string;
  department: string;
  name?: string;
  tab?: string;
  description: string;
  sections: LegacyFormSection[];
  kpiFields?: string[];
}
