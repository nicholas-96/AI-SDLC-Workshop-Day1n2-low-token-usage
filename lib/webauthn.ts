import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { randomBytes } from 'crypto';
import { authenticatorDB, userDB } from './db';

export class WebAuthnError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type ChallengeKind = 'registration' | 'authentication';

interface ChallengeRecord {
  challenge: string;
  expiresAt: number;
}

const globalChallenges = globalThis as unknown as { webauthnChallenges?: Map<string, ChallengeRecord> };
const challenges = globalChallenges.webauthnChallenges ?? new Map<string, ChallengeRecord>();
globalChallenges.webauthnChallenges = challenges;

function config() {
  return {
    rpID: process.env.WEBAUTHN_RP_ID ?? 'localhost',
    origin: process.env.WEBAUTHN_ORIGIN ?? 'http://localhost:3000',
    rpName: process.env.WEBAUTHN_RP_NAME ?? 'Todo App',
  };
}

export function toCredentialId(id: string): string {
  return isoBase64URL.fromBuffer(isoBase64URL.toBuffer(id));
}

function saveChallenge(kind: ChallengeKind, username: string, challenge: string): void {
  challenges.set(`${kind}:${username}`, { challenge, expiresAt: Date.now() + 5 * 60_000 });
}

function takeChallenge(kind: ChallengeKind, username: string): string | null {
  const key = `${kind}:${username}`;
  const record = challenges.get(key);
  challenges.delete(key);
  if (!record || record.expiresAt < Date.now()) return null;
  return record.challenge;
}

export async function beginRegistration(username: string) {
  if (userDB.findByUsername(username)) {
    throw new WebAuthnError('Username is already registered', 409);
  }
  const { rpID, rpName } = config();
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: username,
    userDisplayName: username,
    userID: new Uint8Array(randomBytes(32)),
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });
  saveChallenge('registration', username, options.challenge);
  return options;
}

export async function finishRegistration(username: string, response: RegistrationResponseJSON) {
  const expectedChallenge = takeChallenge('registration', username);
  if (!expectedChallenge) throw new WebAuthnError('Challenge expired', 400);
  if (userDB.findByUsername(username)) throw new WebAuthnError('Username is already registered', 409);
  const { origin, rpID } = config();
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
  } catch {
    throw new WebAuthnError('Registration failed', 400);
  }
  if (!verification.verified || !verification.registrationInfo) {
    throw new WebAuthnError('Registration failed', 400);
  }
  const credential = verification.registrationInfo.credential;
  const credentialId = toCredentialId(credential.id);
  const user = userDB.create(username);
  authenticatorDB.create({
    userId: user.id,
    credentialId,
    publicKey: credential.publicKey,
    counter: credential.counter ?? 0,
  });
  return { userId: user.id, username: user.username };
}

export async function beginLogin(username: string) {
  const user = userDB.findByUsername(username);
  const authenticators = user ? authenticatorDB.findByUserId(user.id) : [];
  if (!user || authenticators.length === 0) throw new WebAuthnError('Unknown user', 401);
  const options = await generateAuthenticationOptions({
    rpID: config().rpID,
    allowCredentials: authenticators.map((authenticator) => ({ id: authenticator.credential_id })),
    userVerification: 'preferred',
  });
  saveChallenge('authentication', username, options.challenge);
  return options;
}

export async function finishLogin(username: string, response: AuthenticationResponseJSON) {
  const user = userDB.findByUsername(username);
  if (!user) throw new WebAuthnError('Unknown user', 401);
  const expectedChallenge = takeChallenge('authentication', username);
  if (!expectedChallenge) throw new WebAuthnError('Challenge expired', 400);
  const credentialId = toCredentialId(response.id);
  const authenticator = authenticatorDB.findByCredentialId(credentialId);
  if (!authenticator || authenticator.user_id !== user.id) throw new WebAuthnError('Unknown credential', 401);
  const storedCounter = authenticator.counter ?? 0;
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: config().origin,
      expectedRPID: config().rpID,
      credential: {
        id: authenticator.credential_id,
        publicKey: new Uint8Array(authenticator.credential_public_key),
        counter: storedCounter,
      },
    });
  } catch {
    throw new WebAuthnError('Authentication failed', 401);
  }
  if (!verification.verified) throw new WebAuthnError('Authentication failed', 401);
  const nextCounter = verification.authenticationInfo.newCounter ?? 0;
  if (!(storedCounter === 0 && nextCounter === 0) && nextCounter <= storedCounter) {
    throw new WebAuthnError('Credential counter regression', 401);
  }
  authenticatorDB.updateCounter(authenticator.id, nextCounter);
  return { userId: user.id, username: user.username };
}
