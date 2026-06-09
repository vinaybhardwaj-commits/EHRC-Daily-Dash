import { renderToBuffer } from '@react-pdf/renderer';
import { FcDocument } from './FcDocument';
import { InfoDocument } from './InfoDocument';
import { AdmDocument } from './AdmDocument';
import type { BookingRow } from '../booking-db';

export type DocType = 'fc' | 'info' | 'adm';

export const DOC_TYPES: DocType[] = ['fc', 'info', 'adm'];

export const DOC_LABEL: Record<DocType, string> = {
  fc: 'Financial-Counselling',
  info: 'Information',
  adm: 'Admission-Slip',
};

export const DOC_TITLE: Record<DocType, string> = {
  fc: 'Financial Estimation Counselling Form',
  info: 'Additional Information',
  adm: 'Admission Slip',
};

export async function renderBookingPdf(type: DocType, booking: BookingRow): Promise<Buffer> {
  const el =
    type === 'fc' ? <FcDocument booking={booking} /> :
    type === 'info' ? <InfoDocument booking={booking} /> :
    <AdmDocument booking={booking} />;
  return renderToBuffer(el);
}
