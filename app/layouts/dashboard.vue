<script setup lang="ts">
const toast = useToast();
const { t } = useI18n();

const userStore = useUserStore()

onMounted(async () => {
    if (!userStore.isAuthenticated) {
        await userStore.initializeAuth()
    }
    const cookie = useCookie("cookie-consent");
    if (cookie.value === "accepted") {
        return;
    }

    toast.add({
        title: t("common.cookieConsent.message"),
        duration: 0,
        close: false,
        actions: [
            {
                label: t("common.cookieConsent.accept"),
                color: "neutral",
                variant: "outline",
                onClick: () => {
                    cookie.value = "accepted";
                },
            },
            {
                label: t("common.cookieConsent.optOut"),
                color: "neutral",
                variant: "ghost",
            },
        ],
    });
});
</script>

<template>
    <UDashboardGroup unit="rem">

        <slot name="sidebar" />
        <slot />
    </UDashboardGroup>
</template>
