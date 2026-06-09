import { listBookingsForCC, toCcDto } from '@/lib/surgical-risk/booking-db';
import CCDeskClient from './CCDeskClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'CC Desk | EHRC Surgery Booking',
  description: 'Counselling & admission work queue for surgery bookings',
};

export default async function CCDeskPage() {
  let initial: ReturnType<typeof toCcDto>[] = [];
  try {
    const rows = await listBookingsForCC();
    initial = rows.map(toCcDto);
  } catch (e) {
    console.error('CC desk initial load failed:', e);
  }
  return <CCDeskClient initial={initial} />;
}
