const { sql } = await import('@vercel/postgres');
const r = await sql`SELECT (SELECT count(*)::int FROM surgical_risk_assessments a JOIN surgery_booking b ON b.id::text=a.form_submission_uid WHERE b.submitted_by_device='sheet-bridge') AS scored, (SELECT count(*)::int FROM surgery_booking b WHERE b.revoked=false AND b.is_test=false AND NOT EXISTS (SELECT 1 FROM surgical_risk_assessments a WHERE a.form_submission_uid=b.id::text)) AS remaining`;
console.log(JSON.stringify(r.rows[0]));
