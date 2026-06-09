import { Document, Page, View, Text } from '@react-pdf/renderer';
import {
  s, HOSPITAL_NAME, HOSPITAL_ADDRESS, BANK, INCLUSIONS, EXCLUSIONS, NOTES,
  DISCLAIMER, CONSENT_FC, SIG_LINE, fmtDate, fmtAgeSex, fmtAmountPaise, fmtDateTime, safe,
} from './styles';
import { Letterhead } from './Letterhead';
import { Row, Half, Full } from './components';
import type { BookingRow } from '../booking-db';

export function FcDocument({ booking: b }: { booking: BookingRow }) {
  const incExcRows = Math.max(INCLUSIONS.length, EXCLUSIONS.length);
  return (
    <Document title={`Financial Counselling - ${safe(b.patient_name)}`}>
      <Page size="A4" style={s.page}>
        <Letterhead title="FINANCIAL ESTIMATION COUNSELLING FORM" />

        <Text style={s.section}>PATIENT DETAILS</Text>
        <Row><Half label="Patient Name:" value={safe(b.patient_name)} /><Half label="Age / Sex:" value={fmtAgeSex(b.age, b.sex)} /></Row>
        <Row><Half label="UHID:" value={safe(b.uhid)} /><Half label="Contact Number:" value={safe(b.contact)} /></Row>

        <Text style={s.section}>ADMISSION DETAILS</Text>
        <Row><Full label="Admitting Consultant:" value={safe(b.surgeon_name)} /></Row>
        <Row><Half label="Date of Admission:" value={fmtDate(b.admission_date)} /><Half label="Arrive by:" value={safe(b.admission_time)} /></Row>
        <Row><Full label="Proposed Procedure:" value={safe(b.proposed_procedure)} /></Row>
        <Row><Half label="Date of Surgery:" value={fmtDate(b.surgery_date)} /><Half label="Planned Time:" value={safe(b.surgery_time)} /></Row>
        <Row><Half label="Payer:" value={safe(b.payer)} /><Half label="Insurance Details:" value={safe(b.insurance_details)} /></Row>
        <Row><Half label="Expected LOS (Days):" value={safe(b.los)} /><Half label="Admission To:" value={safe(b.admission_to)} /></Row>
        <Row><Half label="Bed Category:" value={safe(b.billing_bed)} /><Half label="Admission Type:" value={safe(b.admission_type)} /></Row>

        <Text style={s.section}>FINANCIAL DETAILS</Text>
        <Row><Full label="Package Amount:" value={fmtAmountPaise(b.package_amount_paise)} /></Row>
        <Row><Full label="Advance to Collect:" value={fmtAmountPaise(b.advance_paise)} /></Row>

        <View style={s.incExcHead}><Text style={s.incHead}>INCLUSIONS</Text><Text style={s.excHead}>EXCLUSIONS</Text></View>
        {Array.from({ length: incExcRows }).map((_, i) => (
          <View key={i} style={s.incExcRow}>
            <Text style={s.incCell}>{INCLUSIONS[i] ? `•  ${INCLUSIONS[i]}` : ' '}</Text>
            <Text style={s.excCell}>{EXCLUSIONS[i] ? `•  ${EXCLUSIONS[i]}` : ' '}</Text>
          </View>
        ))}

        <Text style={s.disclaimer}>{DISCLAIMER}</Text>

        <Text style={s.noteHead}>NOTE:</Text>
        {NOTES.map((n, i) => <Text key={i} style={s.note}>{n}</Text>)}

        <Text style={s.bankHead}>HOSPITAL BANK DETAILS</Text>
        {BANK.map(([k, v], i) => <Row key={i}><Full label={k} value={v} wide /></Row>)}

        <View style={{ marginTop: 6 }}><Full label="Remarks:" value={safe(b.remarks)} /></View>
        <Row><Half label="Counselled By:" value={safe(b.counselled_by)} /><Half label="Admission Done By:" value={safe(b.admission_done_by)} /></Row>

        <Text style={s.consentHead}>PATIENT / ATTENDER CONSENT</Text>
        <Text style={s.consentBody}>{CONSENT_FC}</Text>

        <View style={s.sigRow}>
          <Text style={s.sigLabel}>Signature:</Text><Text style={s.sigLine}>{SIG_LINE}</Text>
          <Text style={s.sigLabel}>Date & Time:</Text><Text style={s.sigLine}>{SIG_LINE}</Text>
        </View>
        <View style={s.sigRow}>
          <Text style={s.sigLabel}>Name:</Text><Text style={s.sigLine}>{SIG_LINE}</Text>
          <Text style={s.sigLabel}>Contact No.:</Text><Text style={s.sigLine}>{SIG_LINE}</Text>
        </View>
        <View style={s.sigRow}>
          <Text style={s.sigLabel}>Relation:</Text><Text style={s.sigLine}>{SIG_LINE}</Text>
        </View>

        <Text style={s.footer} fixed>{`${HOSPITAL_NAME}, ${HOSPITAL_ADDRESS}   |   Generated: ${fmtDateTime(new Date())}`}</Text>
      </Page>
    </Document>
  );
}
