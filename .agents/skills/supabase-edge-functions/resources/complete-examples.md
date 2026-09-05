# Complete Examples

## Table of Contents
- [Event CRUD Function](#event-crud-function)
- [Workspace Function](#workspace-function)
- [Stripe Webhook Handler](#stripe-webhook-handler)
- [Email Function](#email-function)

---

## Event CRUD Function

Complete example of a CRUD endpoint with all best practices.

```typescript
// be/supabase/functions/events/index.ts

import { Hono } from '@hono/hono';
import { authenticateWithClient } from '../_shared/lib/auth.ts';
import { supabase } from '../_shared/lib/supabase.ts';
import { checkPlanLimit } from '../_shared/lib/plan-limits.ts';
import { updateResourceUsage } from '../_shared/lib/resource-tracking.ts';
import { validateRequired, validateUUID, validateLength } from '../_shared/lib/validation.ts';
import {
    corsPreflightResponse,
    errorResponse,
    successResponse,
} from '../_shared/lib/responses.ts';
import {
    rateLimit,
    rateLimitHeaders,
    RateLimitPresets,
} from '../_shared/lib/rate-limit.ts';

console.log('START: events function');

const functionName = 'events';
const app = new Hono().basePath(`/${functionName}`);

// =============================================================================
// RATE LIMITING MIDDLEWARE
// =============================================================================
app.use('*', async (c, next) => {
    if (c.req.method === 'OPTIONS') return next();

    const result = await rateLimit(c.req.raw, RateLimitPresets.standard);
    const headers = rateLimitHeaders(result);

    for (const [key, value] of Object.entries(headers)) {
        c.header(key, value);
    }

    if (!result.success) {
        return c.json({
            error: 'Too many requests',
            message: `Rate limit exceeded. Try again in ${result.reset - Math.floor(Date.now() / 1000)} seconds.`,
            retryAfter: result.reset,
        }, 429, headers);
    }

    await next();
});

// =============================================================================
// TYPES
// =============================================================================
interface CreateEventBody {
    name: string;
    description?: string;
    address?: string;
    workspace_id: string;
}

interface UpdateEventBody {
    name?: string;
    description?: string;
    address?: string;
}

// =============================================================================
// LIST EVENTS
// =============================================================================
app.get('/', async (c) => {
    if (c.req.method === 'OPTIONS') return corsPreflightResponse();

    try {
        const { client } = await authenticateWithClient(
            c.req.header('Authorization')
        );

        const workspaceId = c.req.query('workspace_id');

        let query = client
            .from('events')
            .select('*')
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

        if (workspaceId) {
            query = query.eq('workspace_id', workspaceId);
        }

        const { data, error } = await query;

        if (error) throw new Error(error.message);

        return successResponse(data);
    } catch (error) {
        return errorResponse(error, 401);
    }
});

// =============================================================================
// GET SINGLE EVENT
// =============================================================================
app.get('/:id', async (c) => {
    if (c.req.method === 'OPTIONS') return corsPreflightResponse();

    try {
        const { client } = await authenticateWithClient(
            c.req.header('Authorization')
        );

        const eventId = c.req.param('id');
        validateUUID(eventId, 'Event ID');

        const { data, error } = await client
            .from('events')
            .select('*, guests(*)')
            .eq('id', eventId)
            .is('deleted_at', null)
            .single();

        if (error || !data) {
            return errorResponse('Event not found', 404);
        }

        return successResponse(data);
    } catch (error) {
        return errorResponse(error);
    }
});

// =============================================================================
// CREATE EVENT
// =============================================================================
app.post('/', async (c) => {
    if (c.req.method === 'OPTIONS') return corsPreflightResponse();

    try {
        // 1. Authenticate
        const { user, client } = await authenticateWithClient(
            c.req.header('Authorization')
        );

        // 2. Parse and validate input
        const body = await c.req.json() as CreateEventBody;
        validateRequired(body, ['name', 'workspace_id'], 'Event data');
        validateUUID(body.workspace_id, 'Workspace ID');
        validateLength(body.name, { min: 1, max: 255 }, 'Event name');

        if (body.description) {
            validateLength(body.description, { max: 2000 }, 'Description');
        }

        // 3. Verify workspace access (RLS enforced)
        const { data: workspace, error: wsError } = await client
            .from('workspaces')
            .select('id')
            .eq('id', body.workspace_id)
            .single();

        if (wsError || !workspace) {
            throw new Error('Workspace not found or access denied');
        }

        // 4. Check plan limits (service role)
        await checkPlanLimit(supabase, {
            scope: 'workspace',
            workspaceId: body.workspace_id,
            limitField: 'max_events_per_workspace',
            resourceType: 'events',
            resourceTable: 'events',
            filterField: 'workspace_id',
            filterValue: body.workspace_id,
        });

        // 5. Create event (RLS enforced)
        const { data: event, error: createError } = await client
            .from('events')
            .insert({
                name: body.name,
                description: body.description,
                address: body.address,
                workspace_id: body.workspace_id,
                created_by_id: user.id,
                guests_count: 0,
            })
            .select()
            .single();

        if (createError) {
            if (createError.code === '42501') {
                throw new Error('Permission denied: Cannot create events');
            }
            throw new Error(createError.message);
        }

        // 6. Update resource counter (service role)
        await updateResourceUsage(supabase, body.workspace_id, 'events_count');

        return successResponse(event, 201);
    } catch (error) {
        return errorResponse(error);
    }
});

// =============================================================================
// UPDATE EVENT
// =============================================================================
app.put('/:id', async (c) => {
    if (c.req.method === 'OPTIONS') return corsPreflightResponse();

    try {
        const { client } = await authenticateWithClient(
            c.req.header('Authorization')
        );

        const eventId = c.req.param('id');
        validateUUID(eventId, 'Event ID');

        const body = await c.req.json() as UpdateEventBody;

        // Validate optional fields if provided
        if (body.name !== undefined) {
            validateLength(body.name, { min: 1, max: 255 }, 'Event name');
        }
        if (body.description !== undefined) {
            validateLength(body.description, { max: 2000 }, 'Description');
        }

        // Build update object (only non-undefined fields)
        const updateData: Partial<UpdateEventBody> = {};
        if (body.name !== undefined) updateData.name = body.name;
        if (body.description !== undefined) updateData.description = body.description;
        if (body.address !== undefined) updateData.address = body.address;

        if (Object.keys(updateData).length === 0) {
            throw new Error('No fields to update');
        }

        const { data, error } = await client
            .from('events')
            .update(updateData)
            .eq('id', eventId)
            .is('deleted_at', null)
            .select()
            .single();

        if (error) {
            if (error.code === '42501') {
                return errorResponse('Permission denied', 403);
            }
            throw new Error(error.message);
        }

        if (!data) {
            return errorResponse('Event not found', 404);
        }

        return successResponse(data);
    } catch (error) {
        return errorResponse(error);
    }
});

// =============================================================================
// DELETE EVENT (Soft Delete)
// =============================================================================
app.delete('/:id', async (c) => {
    if (c.req.method === 'OPTIONS') return corsPreflightResponse();

    try {
        const { client } = await authenticateWithClient(
            c.req.header('Authorization')
        );

        const eventId = c.req.param('id');
        validateUUID(eventId, 'Event ID');

        // Get event (RLS enforces workspace isolation)
        const { data: event, error: fetchError } = await client
            .from('events')
            .select('id, workspace_id')
            .eq('id', eventId)
            .is('deleted_at', null)
            .single();

        if (fetchError || !event) {
            throw new Error('Event not found or access denied');
        }

        // Soft delete (RLS enforces delete permission)
        const { error: deleteError } = await client
            .from('events')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', eventId);

        if (deleteError) {
            if (deleteError.code === '42501') {
                throw new Error('Permission denied: Cannot delete events');
            }
            throw new Error(deleteError.message);
        }

        // Decrement counter (service role)
        await updateResourceUsage(supabase, event.workspace_id, 'events_count', -1);

        return successResponse({ message: 'Event deleted successfully' });
    } catch (error) {
        return errorResponse(error);
    }
});

// =============================================================================
// SERVE
// =============================================================================
Deno.serve(app.fetch);
```

---

## Workspace Function

```typescript
// be/supabase/functions/workspaces/index.ts

import { Hono } from '@hono/hono';
import { authenticateWithClient } from '../_shared/lib/auth.ts';
import { supabase } from '../_shared/lib/supabase.ts';
import { checkPlanLimit } from '../_shared/lib/plan-limits.ts';
import { validateRequired, validateLength } from '../_shared/lib/validation.ts';
import {
    corsPreflightResponse,
    errorResponse,
    successResponse,
} from '../_shared/lib/responses.ts';
import {
    rateLimit,
    rateLimitHeaders,
    RateLimitPresets,
} from '../_shared/lib/rate-limit.ts';

const app = new Hono().basePath('/workspaces');

// Rate limiting
app.use('*', async (c, next) => {
    if (c.req.method === 'OPTIONS') return next();

    const result = await rateLimit(c.req.raw, RateLimitPresets.standard);
    const headers = rateLimitHeaders(result);
    for (const [key, value] of Object.entries(headers)) {
        c.header(key, value);
    }

    if (!result.success) {
        return c.json({ error: 'Too many requests' }, 429, headers);
    }
    await next();
});

// List user's workspaces
app.get('/', async (c) => {
    if (c.req.method === 'OPTIONS') return corsPreflightResponse();

    try {
        const { user, client } = await authenticateWithClient(
            c.req.header('Authorization')
        );

        // RLS ensures only accessible workspaces returned
        const { data, error } = await client
            .from('workspaces')
            .select(`
                *,
                workspace_members!inner(user_id, role)
            `)
            .is('deleted_at', null)
            .eq('workspace_members.user_id', user.id);

        if (error) throw new Error(error.message);

        return successResponse(data);
    } catch (error) {
        return errorResponse(error);
    }
});

// Create workspace
app.post('/', async (c) => {
    if (c.req.method === 'OPTIONS') return corsPreflightResponse();

    try {
        const { user, client } = await authenticateWithClient(
            c.req.header('Authorization')
        );

        const body = await c.req.json();
        validateRequired(body, ['name'], 'Workspace');
        validateLength(body.name, { min: 1, max: 255 }, 'Workspace name');

        // Check user's workspace limit
        await checkPlanLimit(supabase, {
            scope: 'user',
            userId: user.id,
            limitField: 'max_workspaces',
            resourceType: 'workspaces',
            resourceTable: 'workspaces',
            filterField: 'created_by_id',
            filterValue: user.id,
        });

        // Create workspace
        const { data: workspace, error: createError } = await client
            .from('workspaces')
            .insert({
                name: body.name,
                created_by_id: user.id,
            })
            .select()
            .single();

        if (createError) throw new Error(createError.message);

        // Add creator as owner
        await client
            .from('workspace_members')
            .insert({
                workspace_id: workspace.id,
                user_id: user.id,
                role: 'owner',
            });

        return successResponse(workspace, 201);
    } catch (error) {
        return errorResponse(error);
    }
});

Deno.serve(app.fetch);
```

---

## Stripe Webhook Handler

```typescript
// be/supabase/functions/stripe-webhook/index.ts

import Stripe from 'npm:stripe@14.0.0';
import { supabase } from '../_shared/lib/supabase.ts';
import {
    corsPreflightResponse,
    errorResponse,
    successResponse,
} from '../_shared/lib/responses.ts';
import {
    rateLimit,
    RateLimitPresets,
} from '../_shared/lib/rate-limit.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
    apiVersion: '2023-10-16',
});

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return corsPreflightResponse();
    }

    // Rate limit webhooks
    const rateLimitResult = await rateLimit(req, RateLimitPresets.webhook);
    if (!rateLimitResult.success) {
        return errorResponse('Too many requests', 429);
    }

    try {
        // Get raw body for signature verification
        const body = await req.text();
        const signature = req.headers.get('stripe-signature');

        if (!signature) {
            return errorResponse('Missing signature', 400);
        }

        // Verify webhook signature
        let event: Stripe.Event;
        try {
            event = await stripe.webhooks.constructEventAsync(
                body,
                signature,
                webhookSecret
            );
        } catch (err) {
            console.error('Webhook signature verification failed:', err);
            return errorResponse('Invalid signature', 400);
        }

        // Handle event types
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object as Stripe.Checkout.Session;
                await handleCheckoutComplete(session);
                break;
            }

            case 'customer.subscription.updated': {
                const subscription = event.data.object as Stripe.Subscription;
                await handleSubscriptionUpdate(subscription);
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = event.data.object as Stripe.Subscription;
                await handleSubscriptionCanceled(subscription);
                break;
            }

            case 'invoice.payment_failed': {
                const invoice = event.data.object as Stripe.Invoice;
                await handlePaymentFailed(invoice);
                break;
            }

            default:
                console.log(`Unhandled event type: ${event.type}`);
        }

        return successResponse({ received: true });
    } catch (error) {
        console.error('Webhook error:', error);
        return errorResponse(error, 500);
    }
});

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
    const userId = session.client_reference_id;
    if (!userId) return;

    // Update subscription in database
    await supabase
        .from('subscriptions')
        .upsert({
            user_id: userId,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            subscription_plan: session.metadata?.plan || 'basic',
            status: 'active',
        });

    // Update stripe_customers table
    await supabase
        .from('stripe_customers')
        .upsert({
            user_id: userId,
            stripe_customer_id: session.customer as string,
        });
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
    const customerId = subscription.customer as string;

    // Get user from customer ID
    const { data: customer } = await supabase
        .from('stripe_customers')
        .select('user_id')
        .eq('stripe_customer_id', customerId)
        .single();

    if (!customer) return;

    // Determine plan from price
    const priceId = subscription.items.data[0]?.price.id;
    let plan = 'free';

    if (priceId === Deno.env.get('STRIPE_PRICE_PRO')) {
        plan = 'pro';
    } else if (priceId === Deno.env.get('STRIPE_PRICE_BASIC')) {
        plan = 'basic';
    }

    await supabase
        .from('subscriptions')
        .update({
            subscription_plan: plan,
            status: subscription.status,
        })
        .eq('user_id', customer.user_id);
}

async function handleSubscriptionCanceled(subscription: Stripe.Subscription) {
    const customerId = subscription.customer as string;

    const { data: customer } = await supabase
        .from('stripe_customers')
        .select('user_id')
        .eq('stripe_customer_id', customerId)
        .single();

    if (!customer) return;

    await supabase
        .from('subscriptions')
        .update({
            subscription_plan: 'free',
            status: 'canceled',
        })
        .eq('user_id', customer.user_id);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
    const customerId = invoice.customer as string;

    // Log payment failure
    console.error(`Payment failed for customer ${customerId}`);

    // Could send email notification here
}
```

---

## Email Function

```typescript
// Example email sending function

import { Hono } from '@hono/hono';
import { Resend } from 'npm:resend';
import { authenticateWithClient } from '../_shared/lib/auth.ts';
import { validateRequired, validateEmail } from '../_shared/lib/validation.ts';
import {
    corsPreflightResponse,
    errorResponse,
    successResponse,
} from '../_shared/lib/responses.ts';
import { rateLimit, RateLimitPresets } from '../_shared/lib/rate-limit.ts';

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

const app = new Hono().basePath('/send-invite');

app.use('*', async (c, next) => {
    if (c.req.method === 'OPTIONS') return next();

    const result = await rateLimit(c.req.raw, RateLimitPresets.strict);
    if (!result.success) {
        return c.json({ error: 'Too many requests' }, 429);
    }
    await next();
});

app.post('/', async (c) => {
    if (c.req.method === 'OPTIONS') return corsPreflightResponse();

    try {
        const { user, client } = await authenticateWithClient(
            c.req.header('Authorization')
        );

        const body = await c.req.json();
        validateRequired(body, ['email', 'event_id'], 'Invite');
        validateEmail(body.email);

        // Get event details
        const { data: event, error: eventError } = await client
            .from('events')
            .select('id, name, workspace_id')
            .eq('id', body.event_id)
            .is('deleted_at', null)
            .single();

        if (eventError || !event) {
            throw new Error('Event not found');
        }

        // Send email
        const { error: emailError } = await resend.emails.send({
            from: 'YourSaaS <noreply@example.com>',
            to: body.email,
            subject: `You're invited to ${event.name}`,
            html: `
                <h1>You're Invited!</h1>
                <p>You've been invited to ${event.name}</p>
                <a href="https://example.com/rsvp/${event.id}">RSVP Now</a>
            `,
        });

        if (emailError) {
            throw new Error(`Failed to send email: ${emailError.message}`);
        }

        return successResponse({ message: 'Invitation sent' });
    } catch (error) {
        return errorResponse(error);
    }
});

Deno.serve(app.fetch);
```
