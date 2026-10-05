/** A feed asked us to slow down. The poll loop stretches its interval in response. */
export class RateLimitedError extends Error {
  constructor(
    host: string,
    /** What the feed's Retry-After header asked for, when it sent one. */
    readonly retryAfterMs: number | null,
  ) {
    super(`${host} is rate limiting this receiver, polling slower`);
    this.name = 'RateLimitedError';
  }
}

function retryAfterMs(response: Response): number | null {
  const header = response.headers.get('retry-after');
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

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
    if (response.status === 429) {
      throw new RateLimitedError(new URL(url).host, retryAfterMs(response));
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText} from ${new URL(url).host}`);
    }
    return await response.json();
  } catch (error) {
    throw describeFailure(error, url);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Node's fetch reports every network failure as "fetch failed" and hides the
 * reason in `cause`. The console shows this text to someone deciding whether
 * the address is wrong or the receiver is down, so say which.
 */
function describeFailure(error: unknown, url: string): Error {
  if (!(error instanceof Error)) return new Error(String(error));
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  })();
  if (error.name === 'AbortError') return new Error(`${host} did not answer in time`);
  if (error.message !== 'fetch failed') return error;

  const cause = error.cause as { code?: string; message?: string } | undefined;
  switch (cause?.code) {
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return new Error(`${host} could not be resolved: no such host`);
    case 'ECONNREFUSED':
      return new Error(`${host} refused the connection: nothing is listening there`);
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
      return new Error(`${host} is unreachable from the receiver`);
    case 'ETIMEDOUT':
      return new Error(`${host} did not answer in time`);
    default:
      return new Error(`could not reach ${host}${cause?.message ? `: ${cause.message}` : ''}`);
  }
}
