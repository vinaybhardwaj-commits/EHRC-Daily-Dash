import { Document, Page, View, Text } from '@react-pdf/renderer';
import { s, HOSPITAL_NAME, HOSPITAL_ADDRESS, CONSENT_ADM, SIG_LINE, fmtDate, fmtAgeSex, fmtDateTime, safe } from './styles';
import { Letterhead } from './Letterhead';
import { Row, Half, Full } from './components';
import type { BookingRow } from '../booking-db';

export function AdmDocument({ booking: b }: { booking: BookingRow }) {
  const admWhen = [fmtDate(b.admission_date), b.admission_time ? `(arrive by ${safe(b.admission_time)})` : '']
    .filter(Boolean)
    .join('   ');
  return (
    <Document title={`Admission Slip - ${safe(b.patient_name)}`}>
      <Page size="A4" style={s.page}>
        <Letterhead title="ADMISSION SLIP" />

        <View style={{ marginTop: 8 }}>
          <Row><Half label="Patient Name:" value={safe(b.patient_name)} /><Half label="Age / Sex:" value={fmtAgeSex(b.age, b.sex)} /></Row>
          <Row><Half label="UHID:" value={safe(b.uhid)} /><Half label="Surgical Specialty:" value={safe(b.surgical_specialty)} /></Row>
          <Row><Full label="Admitting Consultant:" value={safe(b.surgeon_name)} /></Row>
          <Row><Full label="Date of Admission:" value={admWhen} /></Row>
          <Row><Full label="Clinical Indication:" value={safe(b.clinical_justification)} /></Row>
          <Row><Full label="Proposed Procedure:" value={safe(b.proposed_procedure)} /></Row>
          <Row><Half label="Expected LOS (Days):" value={safe(b.los)} /><Half label="Admission To:" value={safe(b.admission_to)} /></Row>
        </View>

        <Text style={s.section}>CONSENT STATEMENT</Text>
        <Text style={s.consentBody}>{CONSENT_ADM}</Text>

        <View style={{ flexDirection: 'row', marginTop: 16 }}>
          <View style={{ width: '50%', paddingRight: 10 }}>
            <Text style={s.label}>Doctor</Text>
            <View style={s.sigRow}><Text style={s.sigLabel}>Name:</Text><Text style={s.sigLine}>{safe(b.surgeon_name) || SIG_LINE}</Text></View>
            <View style={s.sigRow}><Text style={s.sigLabel}>Signature:</Text><Text style={s.sigLine}>{SIG_LINE}</Text></View>
            <View style={s.sigRow}><Text style={s.sigLabel}>Date:</Text><Text style={s.sigLine}>{SIG_LINE}</Text></View>
            <View style={s.sigRow}><Text style={s.sigLabel}>Time:</Text><Text style={s.sigLine}>{SIG_LINE}</Text></View>
          </View>
          <View style={{ width: '50%', paddingLeft: 10 }}>
            <Text style={s.label}>Patient / Attender</Text>
            <View style={s.sigRow}><Text style={s.sigLabel}>Name:</Text><Text style={s.sigLine}>{SIG_LINE}</Text></View>
            <View style={s.sigRow}><Text style={s.sigLabel}>Signature:</Text><Text style={s.sigLine}>{SIG_LINE}</Text></View>
            <View style={s.sigRow}><Text style={s.sigLabel}>Relationship:</Text><Text style={s.sigLine}>{SIG_LINE}</Text></View>
            <View style={s.sigRow}><Text style={s.sigLabel}>Date / Time:</Text><Text style={s.sigLine}>{SIG_LINE}</Text></View>
          </View>
        </View>

        <Text style={s.footer} fixed>{`${HOSPITAL_NAME}, ${HOSPITAL_ADDRESS}   |   Generated: ${fmtDateTime(new Date())}`}</Text>
      </Page>
    </Document>
  );
}
