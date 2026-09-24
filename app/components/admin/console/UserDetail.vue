<script setup lang="ts">
import { useConvexMutation, useConvexQuery } from "convex-vue";
import { api } from "~~/convex/_generated/api";
import type { Id } from "~~/convex/_generated/dataModel";
import { formatDateTime } from "~/lib/adminConsole";

/**
 * User detail of the admin console (plan Task 15). Read-only except for the
 * global role, which needs a reason and is audited server-side
 * (`api.admin.setGlobalRole`). A superAdmin cannot change their own role.
 */
const props = defineProps<{ userId: Id<"appUsers"> }>();
const emit = defineEmits<{ close: [] }>();

const { t, locale } = useI18n();
const localePath = useLocalePath();

const { data: detail, error } = useConvexQuery(api.admin.getUser, () => ({ userId: props.userId }), { server: false });
const { data: me } = useConvexQuery(api.admin.whoami, {}, { server: false });

const setGlobalRole = useConvexMutation(api.admin.setGlobalRole);
const { run, pending } = useAdminWrite();
const newRole = ref<"user" | "superAdmin">("user");
const roleReason = ref("");

watch(
    () => detail.value?.user.globalRole,
    (role) => {
        if (role) newRole.value = role;
    },
    { immediate: true },
);

const isSelf = computed(() => !!detail.value && detail.value.user._id === me.value?.appUserId);
const canChangeRole = computed(
    () =>
        !!detail.value
        && !isSelf.value
        && newRole.value !== detail.value.user.globalRole
        && roleReason.value.trim().length > 0
        && !pending.value,
);

async function changeRole() {
    const done = await run(() =>
        setGlobalRole.mutate({ userId: props.userId, role: newRole.value, reason: roleReason.value }),
    );
    if (done) roleReason.value = "";
}

const roleItems = computed(() => [
    { label: t("adminConsole.users.roles.user"), value: "user" as const },
    { label: t("adminConsole.users.roles.superAdmin"), value: "superAdmin" as const },
]);
</script>

<template>
    <section class="space-y-4 rounded-lg border border-neutral-200 bg-white p-4" data-testid="admin-user-detail">
        <p v-if="error" class="text-red-600">{{ t('adminConsole.error') }}</p>
        <p v-else-if="!detail" class="text-neutral-500">{{ t('adminConsole.loading') }}</p>
        <template v-else>
            <div class="flex items-center justify-between gap-2">
                <h2 class="text-lg font-medium break-all">{{ detail.user.email }}</h2>
                <UButton color="neutral" variant="ghost" icon="i-lucide-x" :aria-label="t('adminConsole.close')" @click="emit('close')" />
            </div>
            <p class="text-sm text-neutral-600">
                {{ t(`adminConsole.users.roles.${detail.user.globalRole}`) }} ·
                {{ t('adminConsole.users.createdAt') }} {{ formatDateTime(detail.user.createdAt, locale) }}
                <template v-if="detail.user.purgeAt">
                    · {{ t('adminConsole.users.deletion') }} {{ formatDateTime(detail.user.purgeAt, locale) }}
                </template>
            </p>

            <div>
                <h3 class="mb-1 text-sm font-medium">{{ t('adminConsole.users.memberships') }}</h3>
                <ul class="text-sm">
                    <li v-for="membership in detail.memberships" :key="membership.organizationId">
                        <NuxtLink
                            :to="localePath({ path: '/admin/organizations', query: { id: membership.organizationId } })"
                            class="underline"
                        >
                            {{ membership.name ?? membership.organizationId }}
                        </NuxtLink>
                        · {{ membership.role }}
                    </li>
                    <li v-if="detail.memberships.length === 0" class="text-neutral-500">{{ t('adminConsole.empty') }}</li>
                </ul>
            </div>

            <div>
                <h3 class="mb-1 text-sm font-medium">{{ t('adminConsole.users.exports') }}</h3>
                <ul class="text-sm">
                    <li v-for="row in detail.exports" :key="row._id">
                        {{ formatDateTime(row.createdAt, locale) }} · {{ t(`adminConsole.exports.statuses.${row.status}`) }}
                        <span v-if="row.errorMessage" class="text-red-600">· {{ row.errorMessage }}</span>
                    </li>
                    <li v-if="detail.exports.length === 0" class="text-neutral-500">{{ t('adminConsole.empty') }}</li>
                </ul>
            </div>

            <div>
                <h3 class="mb-1 text-sm font-medium">{{ t('adminConsole.users.recentAudit') }}</h3>
                <ul class="text-sm">
                    <li v-for="row in detail.recentAudit" :key="row._id">
                        {{ formatDateTime(row.createdAt, locale) }} · {{ row.action }}
                        <span v-if="row.reason" class="text-neutral-600">· {{ row.reason }}</span>
                    </li>
                    <li v-if="detail.recentAudit.length === 0" class="text-neutral-500">{{ t('adminConsole.empty') }}</li>
                </ul>
                <NuxtLink :to="localePath({ path: '/admin/audit', query: { actor: detail.user._id } })" class="text-sm underline">
                    {{ t('adminConsole.organizations.viewAudit') }}
                </NuxtLink>
            </div>

            <div class="max-w-xl space-y-3 border-t border-neutral-100 pt-4" data-testid="admin-role-form">
                <h3 class="text-sm font-medium">{{ t('adminConsole.users.changeRole') }}</h3>
                <p v-if="isSelf" class="text-sm text-neutral-500">{{ t('adminConsole.users.ownRole') }}</p>
                <template v-else>
                    <USelect v-model="newRole" :items="roleItems" class="w-full" />
                    <UFormField :label="t('adminConsole.reason.label')" :help="t('adminConsole.reason.hint')">
                        <UInput v-model="roleReason" :placeholder="t('adminConsole.reason.placeholder')" class="w-full" />
                    </UFormField>
                    <UButton :disabled="!canChangeRole" :loading="pending" @click="changeRole">
                        {{ t('adminConsole.users.apply') }}
                    </UButton>
                </template>
            </div>
        </template>
    </section>
</template>
