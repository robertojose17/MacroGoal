// A gateway-valid key is not a user session. Always resolve the caller through
// Supabase Auth and keep body.userId only as a backwards-compatible assertion.
export class RequestError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function bearerToken(req: Request): string {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get('Authorization') ?? '');
  if (!match) throw new RequestError(401, 'Authentication required');
  return match[1];
}

interface UserAuthClient {
  auth: {
    getUser: (token: string) => Promise<{
      data: { user: { id: string } | null };
      error: unknown;
    }>;
  };
}

export async function requireOwnUser(req: Request, client: UserAuthClient): Promise<string> {
  const token = bearerToken(req);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user?.id) throw new RequestError(401, 'Authentication required');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new RequestError(400, 'A JSON object is required');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new RequestError(400, 'A JSON object is required');
  }
  const requestedId = (body as { userId?: unknown }).userId;
  if (requestedId !== undefined && typeof requestedId !== 'string') {
    throw new RequestError(400, 'Invalid userId');
  }
  if (requestedId !== undefined && requestedId !== data.user.id) {
    throw new RequestError(403, 'Access denied');
  }
  return data.user.id;
}
