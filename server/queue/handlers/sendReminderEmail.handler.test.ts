import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  findGuestForEmail,
  findReminderById,
  hasReminderActivity,
  insertActivities,
} = vi.hoisted(() => ({
  findGuestForEmail: vi.fn(),
  findReminderById: vi.fn(),
  hasReminderActivity: vi.fn(),
  insertActivities: vi.fn(),
}));

const { sendEmail } = vi.hoisted(() => ({
  sendEmail: vi.fn(),
}));

const {
  renderGuestReminderEmail,
} = vi.hoisted(() => ({
  renderGuestReminderEmail: vi.fn(),
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
  findReminderById,
  hasReminderActivity,
  insertActivities,
}));

vi.mock("~~/server/utils/email", () => ({
  sendEmail,
}));

vi.mock("~~/server/emailTemplates", () => ({
  renderGuestReminderEmail,
}));

vi.mock("~~/server/services/distribution.service", () => ({
  applyInvitePlaceholders,
  buildGuestInviteLink,
  buildGuestPixelUrl,
}));

import { handleSendReminderEmail } from "./sendReminderEmail.handler";

const validPayload = {
  guestId: "guest-123",
  reminderId: "reminder-456",
};

const mockGuest = {
  id: "guest-123",
  email: "john@example.com",
  firstName: "John",
  removedAt: null,
  remindersDisabled: false,
  eventId: "event-789",
  organizationId: "org-111",
  token: "token-abc",
};

const mockEvent = {
  id: "event-789",
  slug: "my-event",
  title: "My Event",
};

const mockReminder = {
  id: "reminder-456",
  eventId: "event-789",
  subject: "Reminder: {nome}, your RSVP awaits",
  message: "Hi {nome}, don't forget to {link}",
};

beforeEach(() => {
  vi.clearAllMocks();

  // Set up default mocks for all lookups
  findGuestForEmail.mockResolvedValue({
    guest: mockGuest,
    event: mockEvent,
    responseId: null,
  });

  findReminderById.mockResolvedValue(mockReminder);
  hasReminderActivity.mockResolvedValue(false);

  renderGuestReminderEmail.mockResolvedValue({
    html: "<p>Email HTML</p>",
    text: "Email text",
  });
});

describe("sendReminderEmail.handler", () => {
  it("does NOT throw when sendEmail returns skipped (suppressed) — no QStash retry", async () => {
    sendEmail.mockResolvedValue({ success: false, skipped: true, error: "suppressed" });

    await expect(handleSendReminderEmail(validPayload)).resolves.toBeUndefined();
    expect(insertActivities).not.toHaveBeenCalled();
  });

  it("throws on a real send error (retryable)", async () => {
    sendEmail.mockResolvedValue({ success: false, error: "network" });

    await expect(handleSendReminderEmail(validPayload)).rejects.toThrow();
  });

  it("inserts activity on successful send", async () => {
    sendEmail.mockResolvedValue({ success: true, messageId: "msg-123" });

    await expect(handleSendReminderEmail(validPayload)).resolves.toBeUndefined();
    expect(insertActivities).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          organizationId: "org-111",
          eventId: "event-789",
          guestId: "guest-123",
          type: "reminder_sent",
          meta: { reminderId: "reminder-456" },
        }),
      ]),
    );
  });

  it("skips silently when guest not found", async () => {
    findGuestForEmail.mockResolvedValue(null);

    await expect(handleSendReminderEmail(validPayload)).resolves.toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(insertActivities).not.toHaveBeenCalled();
  });

  it("skips when guest already has a response", async () => {
    findGuestForEmail.mockResolvedValue({
      guest: mockGuest,
      event: mockEvent,
      responseId: "response-123",
    });

    await expect(handleSendReminderEmail(validPayload)).resolves.toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("skips when guest has reminders disabled", async () => {
    findGuestForEmail.mockResolvedValue({
      guest: { ...mockGuest, remindersDisabled: true },
      event: mockEvent,
      responseId: null,
    });

    await expect(handleSendReminderEmail(validPayload)).resolves.toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("skips when reminder not found", async () => {
    findReminderById.mockResolvedValue(null);

    await expect(handleSendReminderEmail(validPayload)).resolves.toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("skips when reminder belongs to different event", async () => {
    findReminderById.mockResolvedValue({
      ...mockReminder,
      eventId: "different-event-999",
    });

    await expect(handleSendReminderEmail(validPayload)).resolves.toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("skips when reminder activity already exists (idempotency)", async () => {
    hasReminderActivity.mockResolvedValue(true);

    await expect(handleSendReminderEmail(validPayload)).resolves.toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
