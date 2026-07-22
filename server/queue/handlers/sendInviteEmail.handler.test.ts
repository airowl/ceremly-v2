import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  findGuestForEmail,
} = vi.hoisted(() => ({
  findGuestForEmail: vi.fn(),
}));

const { sendEmail } = vi.hoisted(() => ({
  sendEmail: vi.fn(),
}));

const {
  renderGuestInviteEmail,
} = vi.hoisted(() => ({
  renderGuestInviteEmail: vi.fn(),
}));

const {
  applyInvitePlaceholders,
  buildGuestInviteLink,
  buildGuestPixelUrl,
} = vi.hoisted(() => ({
  applyInvitePlaceholders: vi.fn((template: string, values: Record<string, string>) => {
    let result = template;
    Object.entries(values).forEach(([key, val]) => {
      result = result.replace(new RegExp(`{${key}}`, "g"), val);
    });
    return result;
  }),
  buildGuestInviteLink: vi.fn((slug: string, token: string) => `https://example.com/${slug}?token=${token}`),
  buildGuestPixelUrl: vi.fn((token: string) => `https://example.com/pixel/${token}`),
}));

vi.mock("~~/server/repositories/distributionRepository", () => ({
  findGuestForEmail,
}));

vi.mock("~~/server/utils/email", () => ({
  sendEmail,
}));

vi.mock("~~/server/emailTemplates", () => ({
  renderGuestInviteEmail,
  emailSubjects: {
    guestInvite: (title: string) => `Invite: ${title}`,
  },
}));

vi.mock("~~/server/services/distribution.service", () => ({
  applyInvitePlaceholders,
  buildGuestInviteLink,
  buildGuestPixelUrl,
}));

import { handleSendInviteEmail } from "./sendInviteEmail.handler";

const validPayload = {
  guestId: "g1",
};

const mockGuest = {
  id: "g1",
  email: "guest@example.com",
  firstName: "Alice",
  removedAt: null,
  eventId: "e1",
  organizationId: "org-222",
  token: "token-xyz",
};

const mockEvent = {
  id: "e1",
  slug: "my-event",
  title: "My Event",
  distribution: {
    emailSubject: null,
    emailBody: null,
  },
};

beforeEach(() => {
  vi.clearAllMocks();

  // Set up default mocks for all lookups
  findGuestForEmail.mockResolvedValue({
    guest: mockGuest,
    event: mockEvent,
  });

  renderGuestInviteEmail.mockResolvedValue({
    html: "<p>Email HTML</p>",
    text: "Email text",
  });
});

describe("sendInviteEmail.handler", () => {
  it("passes a stable idempotencyKey invite:<eventId>:<guestId>", async () => {
    sendEmail.mockResolvedValue({ success: true, messageId: "m1" });
    await handleSendInviteEmail(validPayload);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "invite:e1:g1" }),
    );
  });

  it("does NOT throw when sendEmail returns skipped (suppressed)", async () => {
    sendEmail.mockResolvedValue({ success: false, skipped: true, error: "suppressed" });
    await expect(handleSendInviteEmail(validPayload)).resolves.toBeUndefined();
  });

  it("throws on a real send error (retryable)", async () => {
    sendEmail.mockResolvedValue({ success: false, error: "network" });

    await expect(handleSendInviteEmail(validPayload)).rejects.toThrow();
  });

  it("skips silently when guest not found", async () => {
    findGuestForEmail.mockResolvedValue(null);

    await expect(handleSendInviteEmail(validPayload)).resolves.toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("skips when guest has been removed", async () => {
    findGuestForEmail.mockResolvedValue({
      guest: { ...mockGuest, removedAt: new Date() },
      event: mockEvent,
    });

    await expect(handleSendInviteEmail(validPayload)).resolves.toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("skips when guest has no email", async () => {
    findGuestForEmail.mockResolvedValue({
      guest: { ...mockGuest, email: null },
      event: mockEvent,
    });

    await expect(handleSendInviteEmail(validPayload)).resolves.toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
