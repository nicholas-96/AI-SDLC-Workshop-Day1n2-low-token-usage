import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { attachSessionCookie, createSession } from '@/lib/auth';
import { readJson } from '@/lib/http';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { usernameSchema, zodMessage } from '@/lib/validation';
import { finishLogin, WebAuthnError } from '@/lib/webauthn';

const bodySchema = z.object({
  username: usernameSchema,
  response: z.unknown(),
});

export async function POST(request: Request) {
  if (!rateLimit(clientKey(request, 'login-verify'))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  if (typeof parsed.data.response !== 'object' || parsed.data.response == null) {
    return NextResponse.json({ error: 'Invalid credential' }, { status: 400 });
  }
  try {
    const user = await finishLogin(parsed.data.username, parsed.data.response as AuthenticationResponseJSON);
    const token = await createSession(user);
    const response = NextResponse.json({ user: { id: user.userId, username: user.username } });
    attachSessionCookie(response, token);
    return response;
  } catch (error) {
    if (error instanceof WebAuthnError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}
