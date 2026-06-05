<script setup lang="ts">
interface EventMember {
    id: string
    name: string
    email: string
    avatar_url: string | null
    is_owner: boolean
    role: 'owner' | 'editor' | 'viewer'
    status: 'active' | 'pending'
}

const props = defineProps<{
    total: number
    confirmed: number
    pending: number
    declined: number
    teamMembers: EventMember[]
    isLoadingTeam: boolean
    eventId: string
}>()

const responseRate = computed(() => {
    if (props.total === 0) return 0
    return Math.round(((props.confirmed + props.declined) / props.total) * 100)
})

const acceptanceRate = computed(() => {
    const responded = props.confirmed + props.declined
    if (responded === 0) return 0
    return Math.round((props.confirmed / responded) * 100)
})

const displayMembers = computed(() => props.teamMembers.slice(0, 4))

function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
    return name.slice(0, 2).toUpperCase()
}

const roleLabels: Record<string, { label: string; color: 'primary' | 'success' | 'neutral' }> = {
    owner: { label: 'Owner', color: 'primary' },
    editor: { label: 'Editor', color: 'success' },
    viewer: { label: 'Viewer', color: 'neutral' },
}
</script>

<template>
    <div class="space-y-4">
        <!-- Statistiche Veloci -->
        <div class="bg-default p-5 rounded-xl border border-default">
            <h4 class="font-bold text-sm text-highlighted mb-4">Statistiche Veloci</h4>
            <div class="space-y-4">
                <div>
                    <div class="flex justify-between text-xs font-bold mb-1.5">
                        <span class="text-muted">Tasso di Risposta</span>
                        <span class="text-highlighted">{{ responseRate }}%</span>
                    </div>
                    <UProgress :model-value="responseRate" :max="100" color="primary" size="sm" />
                </div>
                <div>
                    <div class="flex justify-between text-xs font-bold mb-1.5">
                        <span class="text-muted">Tasso di Accettazione</span>
                        <span class="text-highlighted">{{ acceptanceRate }}%</span>
                    </div>
                    <UProgress :model-value="acceptanceRate" :max="100" color="success" size="sm" />
                </div>
            </div>
        </div>

        <!-- Team Members -->
        <div class="bg-default p-5 rounded-xl border border-default">
            <h4 class="font-bold text-sm text-highlighted mb-4">Membri del Team</h4>

            <!-- Loading state -->
            <div v-if="isLoadingTeam" class="space-y-3">
                <USkeleton v-for="i in 3" :key="i" class="h-8 w-full rounded-lg" />
            </div>

            <!-- Empty state -->
            <div v-else-if="teamMembers.length === 0" class="text-center py-3">
                <p class="text-xs text-muted">Nessun membro nel team</p>
            </div>

            <!-- Members list -->
            <div v-else class="space-y-3 mb-4">
                <div
                    v-for="member in displayMembers"
                    :key="member.id"
                    class="flex items-center gap-3"
                >
                    <div
                        v-if="member.avatar_url"
                        class="w-8 h-8 rounded-full bg-cover bg-center shrink-0"
                        :style="{ backgroundImage: `url(${member.avatar_url})` }"
                    />
                    <div
                        v-else
                        class="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-[10px] shrink-0"
                    >
                        {{ getInitials(member.name) }}
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-xs font-bold truncate">{{ member.name }}</p>
                        <p class="text-[10px] text-muted">{{ roleLabels[member.role]?.label ?? member.role }}</p>
                    </div>
                </div>
            </div>

            <UButton
                label="Gestisci Team"
                color="neutral"
                variant="outline"
                size="xs"
                block
                :to="`/dashboard/event/${eventId}/team`"
            />
        </div>
    </div>
</template>
