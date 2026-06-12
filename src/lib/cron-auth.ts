// Shared auth for cron-invoked routes.
// Vercel Cron invocations carry (a) the platform x-vercel-cron header
// (stripped from external traffic, value not guaranteed to be '1' — checking
// equality silently 401'd every cron run) and (b) Authorization: Bearer
// CRON_SECRET when that env var is set. Manual triggers use the service secret.
export function isAuthorizedCron(req: { headers: { get(name: string): string | null } }): boolean {
  if (req.headers.get('x-vercel-cron') !== null) return true;
  const auth = req.headers.get('authorization') || '';
  const cron = process.env.CRON_SECRET;
  if (cron && auth === `Bearer ${cron}`) return true;
  const svc = process.env.SERVICE_OBSERVATIONS_SECRET;
  return !!svc && auth === `Bearer ${svc}`;
}
