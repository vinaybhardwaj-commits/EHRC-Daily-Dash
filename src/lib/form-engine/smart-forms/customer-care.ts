// S3c — Native Smart Form: Customer Care
// Migrated from legacy form-definitions.ts customerCareForm (slug 'customer-care').
// Field ids and types preserved exactly to keep `department_data.entries[0].fields` key parity.
// Legacy had no conditional patches in registry.ts for this slug.

import type { SmartFormConfig } from '../types';
import { dateSection } from './_date-section';

export const customerCareSmartForm: SmartFormConfig = {
  slug: 'customer-care',
  title: 'EHRC Morning Meeting — Customer Care',
  department: 'Customer Care',
  description:
    'Fill this before the daily morning meeting.\n★ Starred fields are mandatory.\nTakes under 3 minutes to complete.\n\nTIP: Keep a tally sheet at the front desk for patients who leave OPD without being seen.',
  layout: 'responsive',
  version: 2,
  lastModified: '2026-04-21',
  _legacyTab: 'Customer Care',
  _legacyKpiFields: ['opdAppointmentsInPerson', 'newComplaintsReceived', 'averageStarRating'],
  sections: [
    dateSection,
    {
      id: 'opd-volumes',
      title: '★ OPD VOLUMES',
      description: "Yesterday's appointment and attendance numbers.",
      fields: [
        {
          id: 'opdAppointmentsInPerson',
          label: '# of OPD appointments — in-person',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'opdAppointmentsTele',
          label: '# of OPD appointments — tele',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'opdNoShows',
          label: '# of OPD no-shows (patients who booked but did not arrive)',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'patientsLeftWithoutSeen',
          label: '# of patients who left OPD without being seen (gave up waiting)',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'patientsWaitingOver10Min',
          label: '# of patients waiting > 10 min in OPD (at peak)',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'healthCheckAppointments',
          label: '# of Health check appointments',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
      ],
    },
    {
      id: 'complaints',
      title: '★ COMPLAINTS',
      description: "Track the flow — not just the pile. New vs closed tells us if we're keeping up.",
      fields: [
        {
          id: 'newComplaintsReceived',
          label: '# of new complaints received today',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'complaintsClosed',
          label: '# of complaints closed / resolved today',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'totalComplaintsPending',
          label: '# of total complaints currently pending resolution',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'oldestComplaintAge',
          label: 'Age of oldest open complaint (days)',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'customerEscalations',
          label: '# of customer escalations (complaints escalated to senior management)',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
      ],
    },
    {
      id: 'doctor-punctuality',
      title: '★ DOCTOR PUNCTUALITY',
      description: 'Tracks patient impact — not just whether doctors were late.',
      fields: [
        {
          id: 'doctorsOnLeave',
          label: 'Doctors on leave today (names, or write NIL)',
          type: 'text',
          required: true,
        },
        {
          id: 'doctorsLate',
          label: 'Doctors late > 10 min (names, or write NIL)',
          type: 'text',
          required: true,
        },
        {
          id: 'patientsAffectedByDelays',
          label: '# of patients affected by doctor delays',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
      ],
    },
    {
      id: 'reputation',
      title: '★ REPUTATION',
      description: 'Google is our public scorecard. Rating matters as much as count.',
      fields: [
        {
          id: 'googleReviewsReceived',
          label: '# of Google Reviews received today',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
        {
          id: 'averageStarRating',
          label: 'Average star rating of new Google Reviews (1–5, enter 0 if no reviews today)',
          type: 'number',
          required: true,
          validation: { min: 0, max: 5, step: 0.1 },
        },
        {
          id: 'videoTestimonialsCollected',
          label: '# of Video Testimonials collected',
          type: 'number',
          required: true,
          validation: { min: 0 },
        },
      ],
    },
    {
      id: 'cc-optional',
      title: 'OPTIONAL — ALERTS & NOTES',
      description: 'Fill only if relevant.',
      fields: [
        {
          id: 'vipInternationalAlerts',
          label: 'VIP / International patient alerts',
          type: 'text',
          required: false,
        },
        {
          id: 'callCentrePerformance',
          label: 'Call centre / front office performance note',
          type: 'text',
          required: false,
        },
        {
          id: 'otherNotes',
          label: 'Any other notes',
          type: 'paragraph',
          required: false,
        },
      ],
    },
  ],
};
