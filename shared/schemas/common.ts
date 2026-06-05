import { z } from "zod";

export const emailField = z.string().email();
export const slugField = z.string().min(2).max(50).regex(/^[a-z0-9-]+$/);
export const languageField = z.enum(["it", "en"]).default("it");
export const languageFieldOptional = z.enum(["it", "en"]).optional();
export const passwordField = z.string().min(8);
export const nonEmptyString = z.string().min(1);

/** Query param: required eventId */
export const eventIdQuerySchema = z.object({
    eventId: nonEmptyString,
});
export type EventIdQuery = z.infer<typeof eventIdQuerySchema>;

/** Query param: optional eventId */
export const optionalEventIdQuerySchema = z.object({
    eventId: z.string().optional(),
});
export type OptionalEventIdQuery = z.infer<typeof optionalEventIdQuerySchema>;

/** Query param: pagination with limit */
export const paginationQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
