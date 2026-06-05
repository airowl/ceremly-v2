import { createSharedComposable } from "@vueuse/core";

const _useDashboard = () => {
    const router = useRouter();

    defineShortcuts({
        "g-h": () => router.push("/"),
        "g-i": () => router.push("/inbox"),
        "g-c": () => router.push("/customers"),
        "g-s": () => router.push("/settings"),
    });

    return {};
};

export const useDashboard = createSharedComposable(_useDashboard);
