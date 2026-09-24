<script setup lang="ts">
import { useConvexQuery } from "convex-vue";
import { api } from "~~/convex/_generated/api";
import type { Id } from "~~/convex/_generated/dataModel";
import { convexErrorMessage } from "~/composables/useConvexError";
import { useConvexAction } from "~/composables/useConvexAction";
import { openSignedDownload, toExportView, useExpiryClock, type ExportView } from "~/lib/dataExports";

/**
 * Export history (Task 14, part c): `api.dataExports.history`, live. A completed,
 * unexpired export downloads through a signed URL minted on click
 * (`api.dataExports.downloadUrl`); the server derives `expired`.
 */
const { t } = useI18n();
const toast = useToast();

const { data: historyData, isPending } = useConvexQuery(api.dataExports.history, {}, { server: false });
const downloadUrl = useConvexAction(api.dataExports.downloadUrl);

// A query is not invalidated by the clock: `now` moves at the next expiry.
const now = useExpiryClock(() => historyData.value ?? []);
const history = computed<ExportView[]>(() => (historyData.value ?? []).map((row) => toExportView(row, now.value)));
const isLoading = computed(() => isPending.value && historyData.value === undefined);
const downloadingId = ref<string | null>(null);

function formatFileSize(bytes: number | null): string {
    if (bytes === null) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString();
}

async function downloadExport(exportId: string) {
    if (downloadingId.value) return;

    downloadingId.value = exportId;
    try {
        await openSignedDownload(async () =>
            (await downloadUrl({ exportId: exportId as Id<"dataExports"> })).url,
        );
    } catch (err: unknown) {
        toast.add({
            title: t("common.error"),
            description: convexErrorMessage(err, t("dataExport.downloadError")),
            icon: "i-lucide-alert-circle",
            color: "error",
        });
    } finally {
        downloadingId.value = null;
    }
}
</script>

<template>
    <div class="space-y-4">
        <h3 class="font-medium">{{ t('dataExport.history') }}</h3>

        <!-- Loading -->
        <div v-if="isLoading" class="flex items-center justify-center py-4">
            <UIcon name="i-lucide-loader-2" class="w-6 h-6 animate-spin text-muted-foreground" />
        </div>

        <!-- Empty state -->
        <div v-else-if="history.length === 0" class="text-sm text-muted-foreground">
            {{ t('dataExport.noHistory') }}
        </div>

        <!-- History list -->
        <div v-else class="space-y-2">
            <div
                v-for="item in history"
                :key="item.id"
                class="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
            >
                <div class="space-y-1">
                    <div class="flex items-center gap-2">
                        <span class="text-sm">{{ formatDate(item.createdAt) }}</span>
                        <UBadge
                            :color="
                                item.status === 'completed' ? 'success' :
                                item.status === 'processing' || item.status === 'pending' ? 'warning' :
                                item.status === 'failed' ? 'error' :
                                'neutral'
                            "
                            size="xs"
                        >
                            {{ t(`dataExport.statuses.${item.status}`) }}
                        </UBadge>
                    </div>
                    <div class="text-xs text-muted-foreground">
                        {{ formatFileSize(item.fileSize) }}
                    </div>
                </div>

                <UButton
                    v-if="item.status === 'completed'"
                    icon="i-lucide-download"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :title="t('dataExport.download')"
                    :loading="downloadingId === item.id"
                    :disabled="downloadingId !== null"
                    @click="downloadExport(item.id)"
                />
            </div>
        </div>
    </div>
</template>
