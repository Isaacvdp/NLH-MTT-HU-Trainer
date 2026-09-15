/** Request plumbing shared by every Edge Function: CORS, JSON, error shapes. */

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** An error with an HTTP status, thrown anywhere and rendered by `handle`. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function badRequest(message: string): HttpError {
  return new HttpError(400, message);
}

export function unauthorized(message = 'Sign in first'): HttpError {
  return new HttpError(401, message);
}

export function forbidden(message: string): HttpError {
  return new HttpError(403, message);
}

export function notFound(message: string): HttpError {
  return new HttpError(404, message);
}

export function conflict(message: string): HttpError {
  return new HttpError(409, message);
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Wraps a handler: answers CORS preflight, rejects anything but POST, parses the
 * JSON body, and turns a thrown `HttpError` into a clean response. Unexpected
 * errors are logged server-side and reported to the client without detail.
 */
export function handle<T>(handler: (body: T, req: Request) => Promise<Response>): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
      if (req.method !== 'POST') throw new HttpError(405, 'Use POST');

      let body: T;
      try {
        body = (await req.json()) as T;
      } catch {
        throw badRequest('Body must be JSON');
      }

      return await handler(body, req);
    } catch (error) {
      if (error instanceof HttpError) {
        return json({ error: error.message }, error.status);
      }
      console.error('Unhandled error', error);
      return json({ error: 'Something went wrong' }, 500);
    }
  };
}
