/** fetch with a hard timeout, so a hung feed can never stall the poll loop. */
export async function fetchJson(
  url: string,
  init: RequestInit = {},
  timeoutMs = 8000,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'accept': 'application/json',
        'user-agent': 'skywatch-radar/1.0 (self-hosted ADS-B scope)',
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText} from ${new URL(url).host}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
