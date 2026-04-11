import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

/**
 * GET /api/huddle/recorders
 * List all users with their recorder status.
 */
export async function GET() {
  try {
    const result = await sql`
      SELECT id, email, display_name, role, department_slug,
             is_huddle_recorder, is_active, created_at
      FROM users
      WHERE is_active = true
      ORDER BY is_huddle_recorder DESC, display_name ASC
    `;
    return NextResponse.json({ users: result.rows });
  } catch (error) {
    console.error('Recorders list error:', error);
    return NextResponse.json(
      { error: 'Failed to list users', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/huddle/recorders
 * Toggle recorder permission for a user.
 * Body: { user_id: number, is_huddle_recorder: boolean }
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { user_id, is_huddle_recorder } = body;

    if (!user_id || typeof is_huddle_recorder !== 'boolean') {
      return NextResponse.json(
        { error: 'user_id (number) and is_huddle_recorder (boolean) required' },
        { status: 400 }
      );
    }

    // Update user
    const result = await sql`
      UPDATE users
      SET is_huddle_recorder = ${is_huddle_recorder}, updated_at = NOW()
      WHERE id = ${user_id} AND is_active = true
      RETURNING id, display_name, is_huddle_recorder
    `;

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Log audit trail
    const action = is_huddle_recorder ? 'grant' : 'revoke';
    await sql`
      INSERT INTO huddle_recorder_audit (target_user_id, changed_by_user_id, action, changed_at)
      VALUES (${user_id}, 1, ${action}, NOW())
    `;

    return NextResponse.json({
      success: true,
      user: result.rows[0],
      action,
    });
  } catch (error) {
    console.error('Recorder toggle error:', error);
    return NextResponse.json(
      { error: 'Failed to update recorder status', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
