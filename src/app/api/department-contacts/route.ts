import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

// GET all contacts
export async function GET() {
  try {
    const { rows } = await sql`
      SELECT * FROM department_contacts ORDER BY department_name ASC
    `;
    return NextResponse.json({ contacts: rows });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// POST — update a contact (upsert by slug)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { department_slug, head_name, email, phone, google_sheet_url } = body;

    if (!department_slug) {
      return NextResponse.json({ error: 'department_slug is required' }, { status: 400 });
    }

    const { rows } = await sql`
      UPDATE department_contacts
      SET
        head_name = COALESCE(${head_name || null}, head_name),
        email = COALESCE(${email || null}, email),
        phone = COALESCE(${phone || null}, phone),
        google_sheet_url = COALESCE(${google_sheet_url || null}, google_sheet_url),
        updated_at = NOW()
      WHERE department_slug = ${department_slug}
      RETURNING *
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Department not found' }, { status: 404 });
    }

    return NextResponse.json({ contact: rows[0] });
  } catch (error) {
    console.error('Error updating contact:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
