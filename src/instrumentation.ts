// Development-only: the author's router DNS intermittently fails (EAI_AGAIN),
// which stalls every new database connection. Resolve via public DNS first and
// fall back to the OS. Never runs in production (Vercel's DNS is fine).
export async function register() {
  if (process.env.NODE_ENV === 'development' && process.env.NEXT_RUNTIME === 'nodejs') {
    const { installDevDns } = await import('./instrumentation-node');
    await installDevDns();
  }
}
