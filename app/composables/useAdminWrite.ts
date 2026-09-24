import { convexErrorMessage } from "~/composables/useConvexError";

/**
 * Runs an admin mutation with the console's feedback (plan Task 15): a toast on
 * success, the server's error code on failure. The mutation itself (and its
 * reason check, rate limit and audit) lives in `convex/admin.ts`.
 */
export function useAdminWrite() {
    const toast = useToast();
    const { t } = useI18n();
    const pending = ref(false);

    /**
     * `successTitle` may inspect the result; returning `null` skips the success
     * toast (for writes whose result says "nothing to do").
     */
    async function run<T>(
        write: () => Promise<T>,
        successTitle?: string | ((result: T) => string | null),
    ): Promise<T | null> {
        if (pending.value) return null;
        pending.value = true;
        try {
            const result = await write();
            const title = typeof successTitle === "function" ? successTitle(result) : successTitle ?? t("adminConsole.saved");
            if (title !== null) toast.add({ title, color: "success", icon: "i-lucide-check" });
            return result;
        } catch (error: unknown) {
            toast.add({
                title: t("adminConsole.error"),
                description: convexErrorMessage(error, t("adminConsole.error")),
                color: "error",
                icon: "i-lucide-alert-circle",
            });
            return null;
        } finally {
            pending.value = false;
        }
    }

    return { run, pending };
}
