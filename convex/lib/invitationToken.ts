import { hmacSha256Hex } from "./bridgeHmac";

/**
 * Organization invitation token (Task 14, part b).
 *
 * The token is the credential in the `/invite/{token}` link and the argument of
 * `organizations.acceptInvitation`. Only its SHA-256 is stored (G06), which left
 * delivery with a problem: a job whose payload is ids only cannot know a random
 * token that exists nowhere after the producing mutation returns.
 *
 * So the token is **derived**: `hex(HMAC-SHA256(secret, "org-invite:{invitationId}"))`,
 * keyed with the Better Auth secret. The producer and the delivery job compute the
 * same value from the invitation id, nothing plaintext is persisted (not the
 * invitation row, not the job payload), and a leaked database still cannot mint a
 * token: that needs the secret, which already signs sessions and must not rotate
 * at cutover (G05 handoff). Same shape as the old random token: 64 hex chars,
 * 256 bits.
 *
 * If the secret does rotate between enqueue and delivery, the derived token no
 * longer matches the stored hash; the job checks that and skips instead of sending
 * a dead link.
 *
 * Web Crypto (async): it runs in a V8 mutation and in a V8 action.
 */
export async function deriveInvitationToken(secret: string, invitationId: string): Promise<string> {
    return await hmacSha256Hex(secret, `org-invite:${invitationId}`);
}

/** Legacy parity: the plugin linked `${baseURL}/invite/...`. The segment is now the token. */
export const buildOrgInviteLink = (siteUrl: string, token: string): string =>
    `${siteUrl.replace(/\/+$/, "")}/invite/${token}`;
