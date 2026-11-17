import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJson } from '@/lib/http';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { usernameSchema, zodMessage } from '@/lib/validation';
import { beginRegistration, WebAuthnError } from '@/lib/webauthn';

const bodySchema = z.object({ username: usernameSchema });

export async function POST(request: Request) {
  if (!rateLimit(clientKey(request, 'register-options'))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return NextResponse.json({ error: zodMessage(parsed.error) }, { status: 400 });
  try {
    const options = await beginRegistration(parsed.data.username);
    return NextResponse.json(options);
  } catch (error) {
    if (error instanceof WebAuthnError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
