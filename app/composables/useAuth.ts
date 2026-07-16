import type { Session } from "better-auth";
import type { RouteLocationRaw } from "vue-router";
import { creemClient } from "@creem_io/better-auth/client";
import { adminClient, inferAdditionalFields, organizationClient, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/vue";

export function useAuth() {
    const url = useRequestURL();
    const headers = import.meta.server ? useRequestHeaders() : undefined;
    const client = createAuthClient({
        baseURL: url.origin,
        fetchOptions: {
            headers,
        },
        plugins: [
            inferAdditionalFields({
                user: {
                    creemCustomerId: {
                        type: "string",
                        required: false,
                    },
                    twoFactorEnabled: {
                        type: "boolean",
                        required: false,
                    },
                },
            }),
            adminClient(),
            twoFactorClient(),
            creemClient(),
            organizationClient(),
        ],
    });

    const session = useState<Session | null>(
        "auth:session",
        () => null,
    );
    const user = useState<User | null>("auth:user", () => null);
    const sessionFetching = import.meta.server
        ? ref(false)
        : useState("auth:sessionFetching", () => false);
    const pending = import.meta.server
        ? ref<Promise<unknown> | null>(null)
        : useState<Promise<unknown> | null>("auth:sessionPending", () => null);

    const fetchSession = async () => {
        // F16: if a fetch is already in flight, await IT instead of returning undefined
        // against a possibly-stale session (e.g. concurrent $sessionSignal listener).
        if (sessionFetching.value && pending.value) {
            return pending.value;
        }
        sessionFetching.value = true;
        const run = (async () => {
            const { data } = await client.getSession();
            session.value = data?.session || null;

            const userDefaults = {
                image: null as string | null,
                phone: null as string | null,
                bio: null as string | null,
                role: null as string | null,
                banReason: null as string | null,
                banned: null as boolean | null,
                banExpires: null as Date | null,
                creemCustomerId: null as string | null,
                hadTrial: null as boolean | null,
                locale: null as string | null,
                timezone: null as string | null,
                twoFactorEnabled: null as boolean | null,
                tosAcceptedAt: null as Date | null,
            };
            if (data?.user) {
                const normalizedUser = {
                    ...userDefaults,
                    ...data.user,
                    banned: data.user.banned ?? null,
                    twoFactorEnabled: data.user.twoFactorEnabled ?? null,
                };
                user.value = normalizedUser;
            } else {
                user.value = null;
            }
            return data;
        })();
        pending.value = run;
        try {
            return await run;
        } finally {
            sessionFetching.value = false;
            pending.value = null;
        }
    };

    if (import.meta.client) {
        client.$store.listen("$sessionSignal", async (signal) => {
            if (!signal) {
                return;
            }
            await fetchSession();
        });
    }

    return {
        session,
        user,
        loggedIn: computed(() => !!session.value),
        signIn: client.signIn,
        signUp: client.signUp,
        resetPassword: client.resetPassword,
        sendVerificationEmail: client.sendVerificationEmail,
        errorCodes: client.$ERROR_CODES,
        async signOut({ redirectTo }: { redirectTo?: RouteLocationRaw } = {}) {
            await client.signOut({
                fetchOptions: {
                    onSuccess: async () => {
                        session.value = null;
                        user.value = null;
                        if (redirectTo) {
                            reloadNuxtApp({
                                path: redirectTo.toString(),
                            });
                        }
                    },
                },
            });
        },
        fetchSession,
        client,
        creem: client.creem,
        twoFactor: client.twoFactor,
        organization: client.organization,
    };
}
