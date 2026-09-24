<script setup lang="ts">
import { useConvexMutation, useConvexQuery } from "convex-vue";
import { api } from "~~/convex/_generated/api";
import type { Id } from "~~/convex/_generated/dataModel";
import { formatDateTime, useCursorPager } from "~/lib/adminConsole";

/**
 * Admin console — jobs and GDPR exports (plan Task 15).
 *
 * The only write is re-queuing a `dead` (or legacy `failed`) job, the same
 * transition as `jobs.retryDead` with a reason (`api.admin.retryJob`). Payloads
 * are shown as field names only; exports never expose their download token.
 */
definePageMeta({ layout: "admin", middleware: "admin" });

const { t, locale } = useI18n();
useHead({ title: () => `${t("adminConsole.nav.jobs")} · ${t("adminConsole.title")}` });

type JobStatus = "pending" | "running" | "retrying" | "succeeded" | "failed" | "dead";
type ExportStatus = "pending" | "processing" | "completed" | "failed" | "expired";

const JOB_STATUSES: JobStatus[] = ["dead", "retrying", "pending", "running", "failed", "succeeded"];
const EXPORT_STATUSES: ExportStatus[] = ["failed", "pending", "processing", "completed", "expired"];

const jobStatus = ref<JobStatus>("dead");
const jobPager = useCursorPager();
watch(jobStatus, () => jobPager.reset());

const { data: jobs, error: jobsError } = useConvexQuery(
    api.admin.listJobs,
    () => ({ status: jobStatus.value, paginationOpts: jobPager.paginationOpts.value }),
    { server: false },
);

const exportStatus = ref<ExportStatus>("failed");
const exportPager = useCursorPager();
watch(exportStatus, () => exportPager.reset());

const { data: exports } = useConvexQuery(
    api.admin.listExports,
    () => ({ status: exportStatus.value, paginationOpts: exportPager.paginationOpts.value }),
    { server: false },
);

const retryJob = useConvexMutation(api.admin.retryJob);
const { run, pending } = useAdminWrite();
const retryReason = ref("");
const canRetry = computed(() => retryReason.value.trim().length > 0 && !pending.value);
const toast = useToast();

async function retry(jobId: Id<"jobExecutions">) {
    const result = await run(
        () => retryJob.mutate({ jobId, reason: retryReason.value }),
        (outcome) => (outcome.retried ? t("adminConsole.jobs.retried") : null),
    );
    if (result && !result.retried) {
        toast.add({ title: t("adminConsole.jobs.notRetried"), description: result.reason, color: "warning" });
    }
}

const jobStatusItems = computed(() =>
    JOB_STATUSES.map((status) => ({ label: t(`adminConsole.jobs.statuses.${status}`), value: status })),
);
const exportStatusItems = computed(() =>
    EXPORT_STATUSES.map((status) => ({ label: t(`adminConsole.exports.statuses.${status}`), value: status })),
);

function formatSize(bytes: number | null): string {
    if (bytes === null) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
</script>

<template>
    <div class="space-y-10">
        <section class="space-y-4">
            <h1 class="text-2xl font-semibold">{{ t('adminConsole.jobs.title') }}</h1>

            <div class="flex flex-wrap items-end gap-3">
                <USelect v-model="jobStatus" :items="jobStatusItems" class="w-56" data-testid="admin-job-status" />
                <UFormField v-if="jobStatus === 'dead' || jobStatus === 'failed'" :label="t('adminConsole.reason.label')" :help="t('adminConsole.reason.hint')" class="min-w-64 flex-1">
                    <UInput v-model="retryReason" :placeholder="t('adminConsole.reason.placeholder')" class="w-full" data-testid="admin-retry-reason" />
                </UFormField>
            </div>

            <p v-if="jobsError" class="text-red-600">{{ t('adminConsole.error') }}</p>

            <div class="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
                <table class="w-full text-left text-sm">
                    <thead class="bg-neutral-50 text-xs uppercase text-neutral-500">
                        <tr>
                            <th class="px-3 py-2">{{ t('adminConsole.jobs.name') }}</th>
                            <th class="px-3 py-2">{{ t('adminConsole.jobs.attempts') }}</th>
                            <th class="px-3 py-2">{{ t('adminConsole.jobs.lastError') }}</th>
                            <th class="px-3 py-2">{{ t('adminConsole.jobs.payload') }}</th>
                            <th class="px-3 py-2">{{ t('adminConsole.jobs.updatedAt') }}</th>
                            <th class="px-3 py-2" />
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="job in jobs?.page ?? []" :key="job._id" class="border-t border-neutral-100" data-testid="admin-job-row">
                            <td class="px-3 py-2">{{ job.name }}</td>
                            <td class="px-3 py-2 tabular-nums">{{ job.attempt }} / {{ job.maxAttempts }}</td>
                            <td class="max-w-md px-3 py-2 text-xs break-words text-neutral-600">{{ job.lastError ?? '-' }}</td>
                            <td class="px-3 py-2 text-xs text-neutral-600">{{ job.payloadKeys.join(', ') || '-' }}</td>
                            <td class="px-3 py-2">{{ formatDateTime(job.updatedAt, locale) }}</td>
                            <td class="px-3 py-2">
                                <UButton
                                    v-if="job.status === 'dead' || job.status === 'failed'"
                                    size="xs"
                                    :disabled="!canRetry"
                                    data-testid="admin-job-retry"
                                    @click="retry(job._id)"
                                >
                                    {{ t('adminConsole.jobs.retry') }}
                                </UButton>
                            </td>
                        </tr>
                        <tr v-if="jobs && jobs.page.length === 0">
                            <td colspan="6" class="px-3 py-6 text-center text-neutral-500">{{ t('adminConsole.empty') }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div class="flex gap-2">
                <UButton color="neutral" variant="outline" :disabled="!jobPager.hasPrev.value" @click="jobPager.prev()">{{ t('adminConsole.prev') }}</UButton>
                <UButton color="neutral" variant="outline" :disabled="!jobs || jobs.isDone" @click="jobs && jobPager.next(jobs.continueCursor)">{{ t('adminConsole.next') }}</UButton>
            </div>
        </section>

        <section class="space-y-4">
            <h2 class="text-xl font-semibold">{{ t('adminConsole.exports.title') }}</h2>
            <USelect v-model="exportStatus" :items="exportStatusItems" class="w-56" />
            <div class="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
                <table class="w-full text-left text-sm">
                    <thead class="bg-neutral-50 text-xs uppercase text-neutral-500">
                        <tr>
                            <th class="px-3 py-2">{{ t('adminConsole.exports.user') }}</th>
                            <th class="px-3 py-2">{{ t('adminConsole.exports.createdAt') }}</th>
                            <th class="px-3 py-2">{{ t('adminConsole.exports.size') }}</th>
                            <th class="px-3 py-2">{{ t('adminConsole.exports.expiresAt') }}</th>
                            <th class="px-3 py-2">{{ t('adminConsole.exports.error') }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="row in exports?.page ?? []" :key="row._id" class="border-t border-neutral-100">
                            <td class="px-3 py-2 break-all">{{ row.userEmail ?? row.userId }}</td>
                            <td class="px-3 py-2">{{ formatDateTime(row.createdAt, locale) }}</td>
                            <td class="px-3 py-2">{{ formatSize(row.fileSize) }}</td>
                            <td class="px-3 py-2">{{ formatDateTime(row.expiresAt, locale) }}</td>
                            <td class="px-3 py-2 text-xs text-red-600">{{ row.errorMessage ?? '' }}</td>
                        </tr>
                        <tr v-if="exports && exports.page.length === 0">
                            <td colspan="5" class="px-3 py-6 text-center text-neutral-500">{{ t('adminConsole.empty') }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div class="flex gap-2">
                <UButton color="neutral" variant="outline" :disabled="!exportPager.hasPrev.value" @click="exportPager.prev()">{{ t('adminConsole.prev') }}</UButton>
                <UButton color="neutral" variant="outline" :disabled="!exports || exports.isDone" @click="exports && exportPager.next(exports.continueCursor)">{{ t('adminConsole.next') }}</UButton>
            </div>
        </section>
    </div>
</template>
