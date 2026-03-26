import { runSewaMigration } from '@/lib/sewa-db-migrate';

export async function POST() {
  try {
    const result = await runSewaMigration();
    return Response.json(result);
  } catch (error) {
    console.error('Sewa migration error:', error);
    return Response.json(
      { error: 'Migration failed', details: String(error) },
      { status: 500 }
    );
  }
}
