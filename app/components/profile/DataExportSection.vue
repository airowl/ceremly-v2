<script setup lang="ts">
import { useConvexMutation, useConvexQuery } from "convex-vue";
import { api } from "~~/convex/_generated/api";
import type { Id } from "~~/convex/_generated/dataModel";
import { convexErrorMessage } from "~/composables/useConvexError";
import { useConvexAction } from "~/composables/useConvexAction";
import { isExportInFlight, openSignedDownload, toExportView, type ExportView } from "~/lib/dataExports";

/**
 * GDPR export (Task 14, part c): `api.dataExports.*`.
 *
 * The status is a **live** query: the 3-second polling loop of the legacy
 * component is gone, the row moves pending → processing → completed by itself
 * when the export job writes it. The download is a signed URL (5 minutes, owner
 * only) minted on click by `api.dataExports.downloadUrl`.
 */
const { t } = useI18n();
const toast = useToast();

const { data: statusData, isPending } = useConvexQuery(api.dataExports.status, {}, { server: false });
const requestMutation = useConvexMutation(api.dataExports.request);
const downloadUrl = useConvexAction(api.dataExports.downloadUrl);

const isLoading = computed(() => isPending.value && statusData.value === undefined);
const isRequesting = computed(() => requestMutation.isPending.value);
const isDownloading = ref(false);
const currentExport = computed<ExportView | null>(() =>
    statusData.value?.export ? toExportView(statusData.value.export) : null,
);

async function requestExport() {
    try {
        await requestMutation.mutate({});
        toast.add({
            title: t("common.success"),
            description: t("dataExport.requestSuccess"),
            icon: "i-lucide-check",
            color: "success",
        });
    } catch (err: unknown) {
        toast.add({
            title: t("common.error"),
            description: convexErrorMessage(err, t("dataExport.requestError")),
            icon: "i-lucide-alert-circle",
            color: "error",
        });
    }
}

async function downloadExport() {
    const current = currentExport.value;
    if (!current || current.status !== "completed" || isDownloading.value) return;

    isDownloading.value = true;
    try {
        await openSignedDownload(async () =>
            (await downloadUrl({ exportId: current.id as Id<"dataExports"> })).url,
        );
    } catch (err: unknown) {
        toast.add({
            title: t("common.error"),
            description: convexErrorMessage(err, t("dataExport.downloadError")),
            icon: "i-lucide-alert-circle",
            color: "error",
        });
    } finally {
        isDownloading.value = false;
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
                    v-if="isExportInFlight(currentExport.status)"
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
                        :loading="isDownloading"
                        :disabled="isDownloading"
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
