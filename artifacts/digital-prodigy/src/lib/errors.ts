export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message && !('data' in error)) return error.message;
  if (error && typeof error === 'object' && 'data' in error) {
    const data = error.data;
    if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') return data.error;
  }
  return fallback;
}
