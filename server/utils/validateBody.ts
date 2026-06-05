import type { H3Event, EventHandlerRequest } from "~~/server/types/h3";
import type { z } from "zod";

/**
 * Read and validate request body against a Zod schema.
 * Returns the validated data or throws a 400 error with structured Zod errors.
 */
export async function parseBody<T extends z.ZodType>(
    event: H3Event<EventHandlerRequest>,
    schema: T,
): Promise<z.infer<T>> {
    const body = await readBody(event);
    const result = schema.safeParse(body);
    if (!result.success) {
        throw createError({
            statusCode: 400,
            statusMessage: "Validation failed",
            data: result.error.flatten(),
        });
    }
    return result.data;
}

/**
 * Read and validate query parameters against a Zod schema.
 * Returns the validated data or throws a 400 error with structured Zod errors.
 */
export function parseQueryParams<T extends z.ZodType>(
    event: H3Event<EventHandlerRequest>,
    schema: T,
): z.infer<T> {
    const query = getQuery(event);
    const result = schema.safeParse(query);
    if (!result.success) {
        throw createError({
            statusCode: 400,
            statusMessage: "Invalid query parameters",
            data: result.error.flatten(),
        });
    }
    return result.data;
}
