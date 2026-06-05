<script setup lang="ts">
interface ExportStatus {
    id: string;
    status: "pending" | "processing" | "completed" | "failed" | "expired";
    format: string;
    fileSize: number | null;
    downloadToken: string | null;
    expiresAt: string | null;
    completedAt: string | null;
    errorMessage: string | null;
    createdAt: string;
}

const { t } = useI18n();
const toast = useToast();

const isLoading = ref(false);
const isRequesting = ref(false);
const currentExport = ref<ExportStatus | null>(null);

// Poll interval for status updates
let pollInterval: ReturnType<typeof setInterval> | null = null;

async function fetchStatus() {
    try {
        const response = await $fetch<{
            hasExport: boolean;
            export: ExportStatus | null;
        }>("/api/user/data-export/status");

        currentExport.value = response.export;

        // If export is pending or processing, poll for updates
        if (response.export?.status === "pending" || response.export?.status === "processing") {
            startPolling();
        } else {
            stopPolling();
        }
    } catch {
        // Silent error
    }
}

async function requestExport() {
    isRequesting.value = true;

    try {
        await $fetch("/api/user/data-export/request", { method: "POST" });

        toast.add({
            title: t("common.success"),
            description: t("dataExport.requestSuccess"),
            icon: "i-lucide-check",
            color: "success",
        });

        // Start polling for status
        await fetchStatus();
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : t("dataExport.requestError");
        toast.add({
            title: t("common.error"),
            description: errorMessage,
            icon: "i-lucide-alert-circle",
            color: "error",
        });
    } finally {
        isRequesting.value = false;
    }
}

function downloadExport() {
    if (!currentExport.value?.downloadToken) return;

    // Open download URL in new tab
    window.open(`/api/user/data-export/download/${currentExport.value.downloadToken}`, "_blank");
}

function startPolling() {
    if (pollInterval) return;
    pollInterval = setInterval(fetchStatus, 3000);
}

function stopPolling() {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
}

function formatFileSize(bytes: number | null): string {
    if (bytes === null) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(dateStr: string | null): string {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleString();
}

// Fetch status on mount
onMounted(async () => {
    isLoading.value = true;
    await fetchStatus();
    isLoading.value = false;
});

// Cleanup on unmount
onUnmounted(() => {
    stopPolling();
});
</script>

<template>
    <UPageCard :title="t('dataExport.title')" :description="t('dataExport.description')" variant="subtle">
        <div class="space-y-4">
            <!-- Loading state -->
            <div v-if="isLoading" class="flex items-center justify-center py-4">
                <UIcon name="i-lucide-loader-2" class="w-6 h-6 animate-spin text-muted-foreground" />
            </div>

            <!-- Current export status -->
            <div v-else-if="currentExport" class="space-y-4">
                <!-- Status badge -->
                <div class="flex items-center gap-3">
                    <span class="text-sm text-muted-foreground">{{ t('dataExport.status') }}:</span>
                    <UBadge
                        :color="
                            currentExport.status === 'completed' ? 'success' :
                            currentExport.status === 'processing' || currentExport.status === 'pending' ? 'warning' :
                            currentExport.status === 'failed' ? 'error' :
                            'neutral'
                        "
                    >
                        {{ t(`dataExport.statuses.${currentExport.status}`) }}
                    </UBadge>
                </div>

                <!-- Processing indicator -->
                <div
                    v-if="currentExport.status === 'processing' || currentExport.status === 'pending'"
                    class="flex items-center gap-2 text-sm text-muted-foreground"
                >
                    <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
                    <span>{{ t('dataExport.processing') }}</span>
                </div>

                <!-- Completed export info -->
                <div v-else-if="currentExport.status === 'completed'" class="space-y-2">
                    <div class="flex items-center gap-2 text-sm">
                        <UIcon name="i-lucide-file-json" class="w-4 h-4 text-primary" />
                        <span>{{ formatFileSize(currentExport.fileSize) }}</span>
                    </div>
                    <div class="text-sm text-muted-foreground">
                        {{ t('dataExport.expiresAt') }}: {{ formatDate(currentExport.expiresAt) }}
                    </div>
                    <UButton
                        :label="t('dataExport.download')"
                        icon="i-lucide-download"
                        color="primary"
                        @click="downloadExport"
                    />
                </div>

                <!-- Expired -->
                <div v-else-if="currentExport.status === 'expired'" class="space-y-2">
                    <p class="text-sm text-muted-foreground">{{ t('dataExport.expired') }}</p>
                    <UButton
                        :label="t('dataExport.requestNew')"
                        icon="i-lucide-refresh-cw"
                        color="primary"
                        :loading="isRequesting"
                        :disabled="isRequesting"
                        @click="requestExport"
                    />
                </div>

                <!-- Failed -->
                <div v-else-if="currentExport.status === 'failed'" class="space-y-2">
                    <p class="text-sm text-error">
                        {{ currentExport.errorMessage || t('dataExport.failed') }}
                    </p>
                    <UButton
                        :label="t('dataExport.retry')"
                        icon="i-lucide-refresh-cw"
                        color="primary"
                        :loading="isRequesting"
                        :disabled="isRequesting"
                        @click="requestExport"
                    />
                </div>
            </div>

            <!-- No export yet -->
            <div v-else class="space-y-4">
                <p class="text-sm text-muted-foreground">{{ t('dataExport.noExportYet') }}</p>
                <UButton
                    :label="t('dataExport.request')"
                    icon="i-lucide-download"
                    color="primary"
                    :loading="isRequesting"
                    :disabled="isRequesting"
                    @click="requestExport"
                />
            </div>

            <!-- GDPR info -->
            <div class="pt-4 border-t">
                <div class="flex items-start gap-3 text-sm text-muted-foreground">
                    <UIcon name="i-lucide-shield" class="w-5 h-5 mt-0.5 flex-shrink-0" />
                    <p>{{ t('dataExport.gdprInfo') }}</p>
                </div>
            </div>
        </div>
    </UPageCard>
</template>
