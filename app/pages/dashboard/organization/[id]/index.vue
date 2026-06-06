<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'nuxt/app'
import { useOrganizationStore } from '~/stores/organizationStore'
import { useOrganization } from '~/composables/useOrganization'

const route = useRoute()
const router = useRouter()
const orgStore = useOrganizationStore()
const { canManageOrg } = useOrganization()

// @ts-ignore
definePageMeta({ title: 'Organization', layout: 'dashboard' })

const orgId = computed(() => route.params.id as string)
const loadError = ref<string | null>(null)

async function activateOrg(id: string) {
    loadError.value = null
    const result = await orgStore.setActiveOrganization(id)
    if (!result.success) loadError.value = result.error ?? 'Error loading organization'
}

onMounted(async () => {
    if (!orgId.value) return
    await activateOrg(orgId.value)
})

watch(orgId, async (id) => {
    if (id) await activateOrg(id)
})

async function onDeleted() {
    await router.push('/dashboard/organization')
}
</script>

<template>
    <UDashboardPanel id="organization-detail">
        <template #header>
            <EventPageHeader :title="orgStore.currentOrganization?.name ?? $t('organization.detail.title')" back-to="/dashboard/organization">
                <template #actions>
                    <UButton
                        :label="$t('organization.detail.members')"
                        icon="i-lucide-users"
                        color="neutral"
                        variant="subtle"
                        :to="`/dashboard/organization/${orgId}/members`"
                    />
                    <AdminOrgsDeleteModal
                        v-if="canManageOrg && orgStore.currentOrganization"
                        :organization-id="orgStore.currentOrganization.id"
                        :organization-name="orgStore.currentOrganization.name"
                        @deleted="onDeleted"
                    >
                        <UButton :label="$t('organization.detail.delete')" icon="i-lucide-trash-2" color="error" variant="subtle" />
                    </AdminOrgsDeleteModal>
                </template>
            </EventPageHeader>
        </template>

        <template #body>
            <div v-if="orgStore.isLoading && !orgStore.currentOrganization" class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                <USkeleton class="h-40 lg:col-span-2 rounded-xl" />
                <USkeleton class="h-40 rounded-xl" />
            </div>

            <div v-else-if="loadError" class="text-center py-12">
                <UIcon name="i-lucide-alert-circle" class="size-12 text-error mx-auto mb-4" />
                <p class="text-muted">{{ loadError }}</p>
            </div>

            <template v-else-if="orgStore.currentOrganization">
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                    <div class="lg:col-span-2 bg-default p-5 rounded-xl border border-default">
                        <h3 class="text-sm uppercase text-muted font-medium mb-2">{{ $t('organization.detail.info') }}</h3>
                        <p class="text-2xl font-bold text-highlighted">{{ orgStore.currentOrganization.name }}</p>
                        <p class="text-muted">{{ orgStore.currentOrganization.slug }}</p>
                    </div>
                    <div class="bg-default p-5 rounded-xl border border-default flex items-center justify-between">
                        <div>
                            <p class="text-muted text-sm font-medium mb-1">{{ $t('organization.detail.membersCount') }}</p>
                            <h3 class="text-3xl font-bold text-highlighted">{{ orgStore.members.length }}</h3>
                        </div>
                        <div class="size-12 rounded-full bg-primary/10 flex items-center justify-center">
                            <UIcon name="i-lucide-users" class="size-5 text-primary" />
                        </div>
                    </div>
                </div>
            </template>
        </template>
    </UDashboardPanel>
</template>
