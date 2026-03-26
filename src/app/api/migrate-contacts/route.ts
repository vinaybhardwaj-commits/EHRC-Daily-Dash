import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    if (secret !== process.env.MIGRATION_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await sql`
      CREATE TABLE IF NOT EXISTS department_contacts (
        id SERIAL PRIMARY KEY,
        department_slug VARCHAR(100) UNIQUE NOT NULL,
        department_name VARCHAR(200) NOT NULL,
        head_name VARCHAR(200) DEFAULT '',
        email VARCHAR(200) DEFAULT '',
        phone VARCHAR(50) DEFAULT '',
        google_sheet_url TEXT DEFAULT '',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    const departments: [string, string][] = [
      ['billing', 'Billing'],
      ['biomedical', 'Biomedical'],
      ['clinical-lab', 'Clinical Lab'],
      ['customer-care', 'Customer Care'],
      ['diet', 'Diet & Nutrition'],
      ['emergency', 'Emergency'],
      ['facility', 'Facility'],
      ['finance', 'Finance'],
      ['hr', 'HR & Manpower'],
      ['it', 'IT'],
      ['nursing', 'Nursing'],
      ['ot', 'OT'],
      ['patient-safety', 'Patient Safety'],
      ['pharmacy', 'Pharmacy'],
      ['radiology', 'Radiology'],
      ['supply-chain', 'Supply Chain'],
      ['training', 'Training'],
    ];

    for (const [slug, name] of departments) {
      await sql`
        INSERT INTO department_contacts (department_slug, department_name)
        VALUES (${slug}, ${name})
        ON CONFLICT (department_slug) DO NOTHING
      `;
    }

    return NextResponse.json({ success: true, message: 'department_contacts table created and seeded with 17 departments' });
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
