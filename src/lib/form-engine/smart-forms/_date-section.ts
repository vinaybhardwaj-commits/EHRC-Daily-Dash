// Shared date section used by all native SmartFormConfigs in S3a+.
// Mirrors the legacy `dateSection` in form-definitions.ts — identical field id, label, type.
import type { SmartFormSection } from '../types';

export const dateSection: SmartFormSection = {
  id: 'date',
  title: 'Date',
  fields: [
    {
      id: 'date',
      label: 'Date (DD-MM-YYYY)',
      type: 'text',
      required: true,
    },
  ],
};
