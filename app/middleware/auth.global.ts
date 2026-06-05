import { defu } from "defu";

type MiddlewareOptions = false | {
    /**
     * Only apply auth middleware to guest or user
     */
    only?: "guest" | "user";
    /**
     * Redirect authenticated user to this route
     */
    redirectUserTo?: string;
    /**
     * Redirect guest to this route
     */
    redirectGuestTo?: string;
};

declare module "#app" {
    interface PageMeta {
        auth?: MiddlewareOptions;
    }
}

declare module "vue-router" {
    interface RouteMeta {
        auth?: MiddlewareOptions;
    }
}

export default defineNuxtRouteMiddleware(async (to) => {
    // If auth is disabled, skip middleware
    if (to.meta?.auth === false) {
        return;
    }

    const redirectOptions = useRuntimeConfig().public.auth;
    const { only, redirectUserTo, redirectGuestTo } = defu(
        to.meta?.auth,
        redirectOptions,
    );
    const localePath = useLocalePath();

    // Guest-only pages: skip auth check, just verify if user is logged in to redirect away
    if (only === "guest") {
        const { loggedIn, fetchSession } = useAuth();
        await fetchSession();

        if (loggedIn.value) {
            const redirectPath = localePath(redirectUserTo || "/");
            if (to.path !== redirectPath) {
                return navigateTo(redirectPath);
            }
        }
        // Guest can access, stop here
        return;
    }

    // Protected pages: require authentication
    const { loggedIn, user, fetchSession } = useAuth();
    await fetchSession();

    if (!loggedIn.value) {
        const redirectPath = localePath(redirectGuestTo || "/login");
        // Avoid infinite redirect
        if (to.path === redirectPath) {
            return;
        }
        return navigateTo(`${redirectPath}?redirect=${to.fullPath}`);
    }
});
