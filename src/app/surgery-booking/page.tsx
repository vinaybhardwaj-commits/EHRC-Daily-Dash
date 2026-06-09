import Link from 'next/link';
import BookingForm from './BookingForm';

export const metadata = {
  title: 'Surgery Booking | EHRC Daily Dashboard',
  description: 'Surgery booking & financial counselling intake',
};

export default function SurgeryBookingPage() {
  return (
    <>
      <div className="w-full bg-white border-b border-gray-200 px-4 py-2 flex justify-end gap-4 text-sm">
        <Link href="/cc-desk" className="text-blue-600 hover:underline">CC desk</Link>
        <Link href="/surgical-risk" className="text-blue-600 hover:underline">SREWS dashboard</Link>
      </div>
      <BookingForm />
    </>
  );
}
