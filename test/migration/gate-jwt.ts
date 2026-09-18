import { createPrivateKey, sign } from "node:crypto";
import { GATE_AUTH_APPLICATION_ID, GATE_AUTH_ISSUER } from "../../convex/auth.config";

// Gate-only RS256 token minting. The deployment trusts the matching public JWKS
// through `GATE_AUTH_JWKS` (see convex/auth.config.ts); the private key never
// enters the repository — it is read by the gate from the local environment.
export const GATE_AUTH_KEY_ID = "g02-gate-key";

export interface GateTokenOptions {
    privateKeyPem: string;
    subject: string;
    /** Seconds of validity; Convex rejects an expired token. */
    expiresInSeconds?: number;
}

const base64url = (value: string) => Buffer.from(value, "utf8").toString("base64url");

export function signGateToken({ privateKeyPem, subject, expiresInSeconds = 600 }: GateTokenOptions): string {
    const issuedAt = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT", kid: GATE_AUTH_KEY_ID };
    const payload = {
        sub: subject,
        iss: GATE_AUTH_ISSUER,
        aud: GATE_AUTH_APPLICATION_ID,
        iat: issuedAt,
        exp: issuedAt + expiresInSeconds,
    };

    const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
    const signature = sign("sha256", Buffer.from(signingInput, "utf8"), createPrivateKey(privateKeyPem));

    return `${signingInput}.${signature.toString("base64url")}`;
}

/** Private key from the local environment (base64 PEM), or null when unset. */
export function gatePrivateKeyPem(): string | null {
    const encoded = process.env.GATE_AUTH_PRIVATE_KEY_B64;
    if (!encoded) return null;

    return Buffer.from(encoded, "base64").toString("utf8");
}
