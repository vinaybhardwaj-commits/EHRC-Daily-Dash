/**
 * Rule-based speaker identification engine for hospital morning huddles.
 *
 * Uses vocabulary markers, speech patterns, and structural position
 * derived from analysis of 32 Plaud.ai transcripts to identify
 * Deepgram speaker indices → known department contacts.
 *
 * Confidence tiers:
 *   HIGH   (0.85–1.0)  — strong vocabulary match + structural fit
 *   MEDIUM (0.60–0.84) — partial vocabulary or positional match
 *   LOW    (0.40–0.59) — weak signals, likely needs manual review
 *   NONE   (< 0.40)    — unidentifiable, skip
 */

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker: number;
  speaker_confidence: number;
}

interface DepartmentContact {
  head_name: string;
  department_name: string;
  department_slug: string;
}

export interface SpeakerIdentification {
  speaker_index: number;
  display_name: string;
  department_slug: string;
  confidence: number;
  method: 'auto';
  match_reasons: string[];
}

// ─── Vocabulary Rules ───────────────────────────────────────────────

interface VocabRule {
  department_slug: string;
  /** Words/phrases that strongly indicate this department (case-insensitive) */
  strong_markers: string[];
  /** Words that moderately indicate this department */
  moderate_markers: string[];
  /** Weight multiplier for strong vs moderate */
  strong_weight: number;
  moderate_weight: number;
}

const VOCAB_RULES: VocabRule[] = [
  {
    department_slug: 'finance',
    strong_markers: [
      'arpb', 'average revenue per bed', 'lakhs', 'lakh', 'crores', 'crore',
      'op revenue', 'opd revenue', 'pharmacy revenue', 'revenue for the day',
      'revenue till date', 'ip revenue', 'billing',
    ],
    moderate_markers: [
      'census', 'occupancy', 'surgeries', 'surgery count', 'collection',
      'cashless', 'tpa', 'pre-auth', 'claim', 'insurance',
    ],
    strong_weight: 3.0,
    moderate_weight: 1.0,
  },
  {
    department_slug: 'pharmacy',
    strong_markers: [
      'ipcl', 'opcl', 'inpatient pharmacy', 'outpatient pharmacy',
      'pharmacy stock', 'drug', 'medication', 'shelf life',
    ],
    moderate_markers: [
      'stock', 'shortage', 'excess stock', 'physical stock', 'consumption',
      'first floor', 'second floor', 'boxes', 'one-time use',
    ],
    strong_weight: 3.0,
    moderate_weight: 0.8,
  },
  {
    department_slug: 'patient-safety',
    strong_markers: [
      'nabh', 'incident', 'adverse drug reaction', 'adr', 'fms checklist',
      'qms', 'quality', 'accreditation', 'moq', 'rca', 'root cause',
    ],
    moderate_markers: [
      'evidence', 'chapter wise', 'policies', 'compliance', 'application in progress',
      'uploads', 'audit', 'standard', 'indicator',
    ],
    strong_weight: 3.0,
    moderate_weight: 1.0,
  },
  {
    department_slug: 'emergency',
    strong_markers: [
      'emergency department', 'er case', 'e r case', 'desaturated',
      'trauma', 'ambulance', 'triage',
    ],
    moderate_markers: [
      'admission', 'admissions', 'no cases last night', 'patient came in',
      'fracture', 'post-op', 'referred',
    ],
    strong_weight: 2.5,
    moderate_weight: 1.0,
  },
  {
    department_slug: 'facility',
    strong_markers: [
      'ac breakdown', 'compressor', 'hvac', 'temperature monitoring',
      'maintenance supervisor', 'chidambaran', 'laundry', 'housekeeping',
    ],
    moderate_markers: [
      'ac', 'electrical', 'flooring', 'signage', 'water outage',
      'cleaning', 'sheets', 'linen', 'plumber', 'maintenance',
    ],
    strong_weight: 2.5,
    moderate_weight: 0.8,
  },
  {
    department_slug: 'supply-chain',
    strong_markers: [
      'purchase order', 'p o', 'vendor', 'quotation', 'delivery timeline',
    ],
    moderate_markers: [
      'equipment delivery', 'stock management', 'procurement', 'gst',
      'certification', 'supplier',
    ],
    strong_weight: 2.5,
    moderate_weight: 1.0,
  },
  {
    department_slug: 'nursing',
    strong_markers: [
      'discharge coordinator', 'discharge summary', 'ot cylinders',
      'trolley with regulator', 'infection control', 'fumigation',
    ],
    moderate_markers: [
      'discharge', 'consent', 'icu', 'manpower', 'staffing',
      'chemo consent', 'blood units', 'cross-matching', 'fever spike',
    ],
    strong_weight: 2.5,
    moderate_weight: 0.8,
  },
  {
    department_slug: 'hr',
    strong_markers: [
      'joiners', 'e-learning modules', 'mandatory learning', 'posh',
      'grievance', 'leave policy',
    ],
    moderate_markers: [
      'training', 'account deactivation', 'committee members',
      'escalation', 'first level', 'work from home',
    ],
    strong_weight: 2.5,
    moderate_weight: 0.8,
  },
  {
    department_slug: 'training',
    strong_markers: [
      'training calendar', 'training schedule', 'service standards',
      'grooming training', 'pre-test', 'post-test',
    ],
    moderate_markers: [
      'module', 'hypertension module', 'security teams',
      'key management training',
    ],
    strong_weight: 2.5,
    moderate_weight: 1.0,
  },
  {
    department_slug: 'radiology',
    strong_markers: [
      'ct machine', 'gantry', 'pcpndt', 'radiologist',
    ],
    moderate_markers: [
      'ct', 'vibration', 'circuit burnout', 'film', 'reporting',
      'service engineer', 'bmac',
    ],
    strong_weight: 2.5,
    moderate_weight: 0.8,
  },
  {
    department_slug: 'clinical-lab',
    strong_markers: [
      'metropolis', 'lab technician', 'microbial resistance',
      'doctor nivedita',
    ],
    moderate_markers: [
      'batch', 'lab', 'sample', 'report', 'test result',
    ],
    strong_weight: 2.5,
    moderate_weight: 0.7,
  },
  {
    department_slug: 'biomedical',
    strong_markers: [
      'autoclave', 'sterilization', 'pm schedule', 'preventive maintenance',
      'lead aprons', 'service engineer',
    ],
    moderate_markers: [
      'equipment defective', 'circuits', 'replacement', 'calibration',
    ],
    strong_weight: 2.5,
    moderate_weight: 0.8,
  },
  {
    department_slug: 'it',
    strong_markers: [
      'care expert', 'pulse system', 'system access', 'credentials',
    ],
    moderate_markers: [
      'slack', 'email', 'computer', 'asset tagging', 'system',
    ],
    strong_weight: 2.0,
    moderate_weight: 0.5,
  },
  {
    department_slug: 'diet',
    strong_markers: [
      'catering', 'diet sheet', 'menu', 'calorie', 'barcode printer',
    ],
    moderate_markers: [
      'food', 'diet', 'portion', 'sambar', 'pro nutri', 'meal',
    ],
    strong_weight: 2.5,
    moderate_weight: 0.8,
  },
  {
    department_slug: 'customer-care',
    strong_markers: [
      'physical consultation', 'sharing consultation', 'billing escalation',
      'fifty percent discount', 'patient feedback',
    ],
    moderate_markers: [
      'google form', 'intake', 'satisfaction', 'non-disclosure',
      'complaint', 'customer',
    ],
    strong_weight: 2.5,
    moderate_weight: 0.8,
  },
  {
    department_slug: 'ot',
    strong_markers: [
      'ot three', 'ot3', 'ot one', 'ot1', 'endoscopic', 'light boxes',
      'tkr cases',
    ],
    moderate_markers: [
      'surgery scheduled', 'going to ot', 'equipment sourcing',
      'surgical', 'operating theatre',
    ],
    strong_weight: 2.0,
    moderate_weight: 0.7,
  },
];

// ─── Facilitator Detection ──────────────────────────────────────────

const FACILITATOR_STRONG_PHRASES = [
  'anything i can help you with',
  'is there any way i can help',
  'shall we move on to',
  'shall we go on to',
  'let\'s start with',
  'let us start with',
  'anything else i can help you with',
  'we will move on to',
  'we\'ll move on to',
  'anything you want to talk about',
  'anything you wanted to bring up',
  'is there any way i can be of assistance',
  'go ahead',
  'thank you guys',
];

const FACILITATOR_MODERATE_PHRASES = [
  'brilliant',
  'all right',
  'alright',
  'understood',
  'thank you',
  'okay so',
  'um',
  'uh',
];

// ─── Core Engine ────────────────────────────────────────────────────

/**
 * Identify speakers from transcript content using vocabulary rules.
 *
 * @param segments  Deepgram transcript segments with speaker indices
 * @param contacts  Department contact list from DB
 * @returns Array of identifications, one per identified speaker index
 */
export function identifySpeakers(
  segments: TranscriptSegment[],
  contacts: DepartmentContact[],
): SpeakerIdentification[] {
  // 1. Group text by speaker index
  const speakerTexts = new Map<number, string[]>();
  const speakerSegmentCounts = new Map<number, number>();

  for (const seg of segments) {
    const existing = speakerTexts.get(seg.speaker) || [];
    existing.push(seg.text);
    speakerTexts.set(seg.speaker, existing);
    speakerSegmentCounts.set(seg.speaker, (speakerSegmentCounts.get(seg.speaker) || 0) + 1);
  }

  const speakerIndices = Array.from(speakerTexts.keys()).sort((a, b) => a - b);
  const totalSegments = segments.length;

  // 2. Build contact lookup by department_slug
  const contactBySlug = new Map<string, DepartmentContact>();
  for (const c of contacts) {
    contactBySlug.set(c.department_slug, c);
  }

  // 3. Score each speaker against each department rule
  const speakerScores = new Map<number, Map<string, { score: number; reasons: string[] }>>();

  for (const spkIdx of speakerIndices) {
    const fullText = (speakerTexts.get(spkIdx) || []).join(' ').toLowerCase();
    const segCount = speakerSegmentCounts.get(spkIdx) || 0;
    const deptScores = new Map<string, { score: number; reasons: string[] }>();

    for (const rule of VOCAB_RULES) {
      let score = 0;
      const reasons: string[] = [];

      // Score strong markers
      for (const marker of rule.strong_markers) {
        const regex = new RegExp(escapeRegex(marker), 'gi');
        const matches = fullText.match(regex);
        if (matches) {
          score += matches.length * rule.strong_weight;
          reasons.push(`"${marker}" x${matches.length}`);
        }
      }

      // Score moderate markers
      for (const marker of rule.moderate_markers) {
        const regex = new RegExp(escapeRegex(marker), 'gi');
        const matches = fullText.match(regex);
        if (matches) {
          score += matches.length * rule.moderate_weight;
          if (reasons.length < 5) {
            reasons.push(`"${marker}" x${matches.length}`);
          }
        }
      }

      if (score > 0) {
        deptScores.set(rule.department_slug, { score, reasons });
      }
    }

    speakerScores.set(spkIdx, deptScores);
  }

  // 4. Detect facilitator (Dr. Bhardwaj / V)
  //    Criteria: highest segment count + facilitator phrases
  let facilitatorIdx: number | null = null;
  let facilitatorConfidence = 0;
  const facilitatorReasons: string[] = [];

  for (const spkIdx of speakerIndices) {
    const fullText = (speakerTexts.get(spkIdx) || []).join(' ').toLowerCase();
    const segCount = speakerSegmentCounts.get(spkIdx) || 0;
    const speakingShare = segCount / totalSegments;

    let facScore = 0;
    const reasons: string[] = [];

    // High speaking share is a strong signal
    if (speakingShare > 0.35) {
      facScore += 4;
      reasons.push(`${Math.round(speakingShare * 100)}% of segments`);
    } else if (speakingShare > 0.25) {
      facScore += 2;
      reasons.push(`${Math.round(speakingShare * 100)}% of segments`);
    }

    // Check facilitator phrases
    for (const phrase of FACILITATOR_STRONG_PHRASES) {
      if (fullText.includes(phrase)) {
        facScore += 3;
        reasons.push(`"${phrase.slice(0, 30)}..."`);
      }
    }

    let moderateCount = 0;
    for (const phrase of FACILITATOR_MODERATE_PHRASES) {
      const regex = new RegExp(`\\b${escapeRegex(phrase)}\\b`, 'gi');
      const matches = fullText.match(regex);
      if (matches) {
        moderateCount += matches.length;
      }
    }
    if (moderateCount > 5) {
      facScore += 1;
      reasons.push(`${moderateCount} filler words`);
    }

    if (facScore > facilitatorConfidence) {
      facilitatorConfidence = facScore;
      facilitatorIdx = spkIdx;
      facilitatorReasons.length = 0;
      facilitatorReasons.push(...reasons);
    }
  }

  // 5. Assign departments to speakers (greedy best-match)
  const results: SpeakerIdentification[] = [];
  const assignedDepts = new Set<string>();
  const assignedSpeakers = new Set<number>();

  // Assign facilitator first if confident
  if (facilitatorIdx !== null && facilitatorConfidence >= 4) {
    const conf = Math.min(1.0, 0.5 + facilitatorConfidence * 0.07);
    results.push({
      speaker_index: facilitatorIdx,
      display_name: 'Dr. Bhardwaj',
      department_slug: 'admin',
      confidence: Math.round(conf * 100) / 100,
      method: 'auto',
      match_reasons: facilitatorReasons,
    });
    assignedSpeakers.add(facilitatorIdx);
  }

  // Build a sorted list of (speaker, dept, score) triples
  const candidates: Array<{
    speaker: number;
    dept: string;
    score: number;
    reasons: string[];
  }> = [];

  for (const spkIdx of speakerIndices) {
    if (assignedSpeakers.has(spkIdx)) continue;
    const deptScores = speakerScores.get(spkIdx);
    if (!deptScores) continue;

    for (const [dept, { score, reasons }] of deptScores) {
      candidates.push({ speaker: spkIdx, dept, score, reasons });
    }
  }

  // Sort by score descending — highest confidence matches first
  candidates.sort((a, b) => b.score - a.score);

  // Greedy assignment: each speaker gets at most one dept, each dept at most one speaker
  for (const cand of candidates) {
    if (assignedSpeakers.has(cand.speaker) || assignedDepts.has(cand.dept)) continue;

    const contact = contactBySlug.get(cand.dept);
    if (!contact) continue;

    // Convert raw score to 0–1 confidence
    // Thresholds calibrated from rubric: strong match ≥ 6, medium ≥ 3
    const confidence = Math.min(1.0, Math.max(0.3, 0.3 + cand.score * 0.08));
    const roundedConf = Math.round(confidence * 100) / 100;

    // Skip very low confidence matches
    if (roundedConf < 0.40) continue;

    results.push({
      speaker_index: cand.speaker,
      display_name: contact.head_name,
      department_slug: cand.dept,
      confidence: roundedConf,
      method: 'auto',
      match_reasons: cand.reasons.slice(0, 4),
    });

    assignedSpeakers.add(cand.speaker);
    assignedDepts.add(cand.dept);
  }

  // Sort by speaker index for consistent ordering
  results.sort((a, b) => a.speaker_index - b.speaker_index);

  return results;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
