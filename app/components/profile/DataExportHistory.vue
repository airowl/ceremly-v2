<script setup lang="ts">
interface ExportHistoryItem {
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

const history = ref<ExportHistoryItem[]>([]);
const isLoading = ref(false);

async function fetchHistory() {
    isLoading.value = true;

    try {
        const response = await $fetch<{ exports: ExportHistoryItem[] }>("/api/user/data-export/history");
        history.value = response.exports;
    } catch {
        // Silent error
    } finally {
        isLoading.value = false;
    }
}

function formatFileSize(bytes: number | null): string {
    if (bytes === null) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString();
}

function downloadExport(token: string | null) {
    if (!token) return;
    window.open(`/api/user/data-export/download/${token}`, "_blank");
}

// Fetch history on mount
onMounted(() => {
    fetchHistory();
});
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
                    v-if="item.status === 'completed' && item.downloadToken"
                    icon="i-lucide-download"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :title="t('dataExport.download')"
                    @click="downloadExport(item.downloadToken)"
                />
            </div>
        </div>
    </div>
</template>
