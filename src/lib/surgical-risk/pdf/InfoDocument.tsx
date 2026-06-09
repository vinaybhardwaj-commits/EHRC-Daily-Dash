import { Document, Page, Text } from '@react-pdf/renderer';
import { s, HOSPITAL_NAME, HOSPITAL_ADDRESS, fmtDateTime, safe } from './styles';
import { Letterhead } from './Letterhead';
import { Full } from './components';
import type { BookingRow } from '../booking-db';

const FLAG_BG: Record<string, string> = {
  'Requested time and dates OK': '#c6efce',
  'Requested time and dates provisionally OK': '#d9ead3',
  "Requested time and dates most likely OK, subject to anaesthetist's advice": '#fff2cc',
  'More time after admission (at least 4 working hours) required before requested OT time': '#fce5cd',
  'More time after admission (at least 12 working hours) required before requested OT time': '#f4cccc',
  'Requested time of surgery out of operational hours': '#f4b084',
  'Anaesthetist + facility head need to discuss with the operating surgeon': '#ea9999',
};

export function InfoDocument({ booking: b }: { booking: BookingRow }) {
  const flag = safe(b.flag);
  const transfer = b.transfer === null || b.transfer === undefined ? '' : b.transfer ? 'Yes' : 'No';
  return (
    <Document title={`Additional Information - ${safe(b.patient_name)}`}>
      <Page size="A4" style={s.page}>
        <Letterhead title="ADDITIONAL INFORMATION" />
        <Text style={s.sub}>{`Patient: ${safe(b.patient_name)}   |   UHID: ${safe(b.uhid)}   |   Generated: ${fmtDateTime(new Date())}`}</Text>

        {flag ? <Text style={[s.flagBanner, { backgroundColor: FLAG_BG[flag] || '#eeeeee' }]}>{flag}</Text> : null}

        <Text style={s.section}>IDENTIFIERS</Text>
        <Full label="Submission Time:" value={fmtDateTime(b.created_at)} wide />
        <Full label="Counselled By:" value={safe(b.counselled_by)} wide />

        <Text style={s.section}>CLINICAL DETAILS</Text>
        <Full label="Surgical Specialty:" value={safe(b.surgical_specialty)} wide />
        <Full label="Laterality:" value={safe(b.laterality)} wide />
        <Full label="Anaesthesia:" value={safe(b.anaesthesia)} wide />
        <Full label="Urgency:" value={safe(b.urgency)} wide />
        <Full label="Clinical Justification:" value={safe(b.clinical_justification)} wide />

        <Text style={s.section}>{'PRE-OP RISK & WORKUP'}</Text>
        <Full label="Known Co-morbidities:" value={safe(b.comorbidities)} wide />
        <Full label="PAC Status:" value={safe(b.pac_status)} wide />
        <Full label="Anaesthetist's Advice:" value={safe(b.pac_advice)} wide />
        <Full label="Habits:" value={safe(b.habits)} wide />

        <Text style={s.section}>{'LOGISTICS & EXTRAS'}</Text>
        <Full label="Transfer Patient:" value={transfer} wide />
        <Full label="Referring Hospital:" value={safe(b.referring_hospital)} wide />
        <Full label="Special Requirements:" value={safe(b.special_requirements)} wide />
        <Full label="Staying Bed Category:" value={safe(b.staying_bed)} wide />
        <Full label="Open Bill Items:" value={safe(b.open_bill_items)} wide />
        <Full label="Prescription File:" value={safe(b.prescription_url)} wide />

        <Text style={s.footer} fixed>{`${HOSPITAL_NAME}, ${HOSPITAL_ADDRESS}   |   Generated: ${fmtDateTime(new Date())}`}</Text>
      </Page>
    </Document>
  );
}
