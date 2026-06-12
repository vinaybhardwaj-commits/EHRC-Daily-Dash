// GV.4 — Medical Superintendent daily OPPE/FPPE observation form.
// The static config is just the date + a general-notes field; the per-doctor
// observation blocks are generated nightly from the EPI governance system
// (open OPPE reviews + the manual watch list in gv_config) and merged in at
// serve time like every other governance section.

import type { SmartFormConfig } from '../types';
import { dateSection } from './_date-section';

export const oppeObservationsSmartForm: SmartFormConfig = {
  slug: 'oppe-observations',
  title: 'EHRC — Doctors Under Observation (OPPE/FPPE)',
  department: 'Medical Superintendent',
  description:
    'Daily structured feedback on doctors currently under observation.\nThe doctor list below is generated each morning from the EPI governance system — if no doctors are listed, none are under observation today.',
  layout: 'responsive',
  version: 1,
  lastModified: '2026-06-12',
  _legacyTab: 'OPPE',
  sections: [
    dateSection,
    {
      id: 'oppe-general',
      title: 'General notes',
      fields: [
        {
          id: 'oppeGeneralNotes',
          label: 'General observations / context for today (optional)',
          type: 'paragraph',
          placeholder: 'Anything that applies across doctors, or context for the ratings below',
        },
      ],
    },
  ],
};
