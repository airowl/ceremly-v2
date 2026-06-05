<script setup lang="ts">
const props = defineProps<{
    mode: 'create' | 'edit'
    initialData?: {
        name: string
        type: 'email' | 'whatsapp'
        subject: string
        body: string
    }
    isSubmitting: boolean
}>()

const emit = defineEmits<{
    submit: [data: { name: string; type: 'email' | 'whatsapp'; subject: string | null; body: string }]
}>()

const route = useRoute()
const eventId = computed(() => route.params.id as string)
const eventStore = useEventStore()
const { user } = useAuth()

// ── Form state ──
const form = reactive({
    name: props.initialData?.name ?? '',
    type: (props.initialData?.type ?? 'email') as 'email' | 'whatsapp',
    subject: props.initialData?.subject ?? '',
    body: props.initialData?.body ?? '',
})

// Sync initialData when it arrives (edit mode async load)
watch(() => props.initialData, (data) => {
    if (data) {
        form.name = data.name
        form.type = data.type
        form.subject = data.subject
        form.body = data.body
    }
})

// ── Load event data for preview ──
onMounted(async () => {
    if (!eventStore.currentEvent || eventStore.currentEvent.id !== eventId.value) {
        await eventStore.loadEvent(eventId.value)
    }
})

// ── Variable tags ──
const variableTags = [
    { key: 'guest_name', label: 'Nome invitato' },
    { key: 'event_name', label: 'Nome evento' },
    { key: 'event_date', label: 'Data evento' },
    { key: 'event_time', label: 'Ora evento' },
    { key: 'event_location', label: 'Luogo' },
    { key: 'rsvp_link', label: 'Link RSVP' },
    { key: 'deadline', label: 'Scadenza' },
    { key: 'organizer_name', label: 'Organizzatore' },
]

// ── Click-to-insert logic ──
const textareaRef = ref<{ $el?: HTMLElement } | null>(null)

function insertVariable(key: string) {
    const tag = `{{${key}}}`
    const el = textareaRef.value?.$el?.querySelector('textarea') as HTMLTextAreaElement | null
    if (!el) {
        form.body += tag
        return
    }

    const start = el.selectionStart
    const end = el.selectionEnd
    const before = form.body.slice(0, start)
    const after = form.body.slice(end)
    form.body = before + tag + after

    nextTick(() => {
        const newPos = start + tag.length
        el.focus()
        el.setSelectionRange(newPos, newPos)
    })
}

// ── Preview interpolation ──
function formatDateIT(dateStr: string | null | undefined): string {
    if (!dateStr) return ''
    try {
        const d = new Date(dateStr + 'T00:00:00')
        return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
    } catch {
        return dateStr
    }
}

function formatTimeIT(timeStr: string | null | undefined): string {
    if (!timeStr) return ''
    return timeStr.slice(0, 5) // "HH:mm:ss" -> "HH:mm"
}

const previewVariables = computed(() => {
    const ev = eventStore.currentEvent
    const baseUrl = window?.location?.origin ?? 'https://ceremly.com'
    return {
        guest_name: 'Marco',
        event_name: ev?.name ?? 'Il tuo evento',
        event_date: formatDateIT(ev?.date),
        event_time: formatTimeIT(ev?.time),
        event_location: ev?.location ?? '',
        rsvp_link: ev ? `${baseUrl}/rsvp/${ev.slug}` : `${baseUrl}/rsvp/evento`,
        deadline: formatDateIT(ev?.deadline),
        organizer_name: user.value?.name ?? 'Organizzatore',
    }
})

const previewBody = computed(() => {
    return form.body.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
        return previewVariables.value[key as keyof typeof previewVariables.value] ?? `{{${key}}}`
    })
})

const previewSubject = computed(() => {
    if (!form.subject) return form.name || 'Reminder'
    return form.subject.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
        return previewVariables.value[key as keyof typeof previewVariables.value] ?? `{{${key}}}`
    })
})

// ── Submit ──
function handleSubmit() {
    emit('submit', {
        name: form.name.trim(),
        type: form.type,
        subject: form.type === 'email' ? (form.subject.trim() || null) : null,
        body: form.body.trim(),
    })
}

defineExpose({ handleSubmit })
</script>

<template>
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <!-- Left Column: Form -->
        <div class="lg:col-span-7 space-y-6">
            <!-- Title -->
            <div>
                <h1 class="text-3xl font-extrabold tracking-tight">
                    {{ mode === 'create' ? 'Configura Reminder' : 'Modifica Reminder' }}
                </h1>
                <p class="text-muted text-sm mt-1">
                    Personalizza il messaggio di sollecito per i tuoi invitati.
                </p>
            </div>

            <!-- Form card -->
            <div class="bg-default rounded-xl border border-default p-6 space-y-6">
                <!-- Name -->
                <div class="flex flex-col gap-2">
                    <label class="text-xs font-bold text-muted uppercase tracking-wider">
                        Nome del Reminder
                    </label>
                    <UInput
                        v-model="form.name"
                        placeholder="es. Secondo sollecito RSVP"
                        size="lg"
                    />
                </div>

                <!-- Channel selector -->
                <div class="flex flex-col gap-3">
                    <label class="text-xs font-bold text-muted uppercase tracking-wider">
                        Canale di invio
                    </label>
                    <div class="grid grid-cols-2 gap-4">
                        <button
                            type="button"
                            :class="[
                                'flex flex-col items-center gap-2 p-4 rounded-lg border-2 cursor-pointer transition-all',
                                form.type === 'email'
                                    ? 'border-primary bg-primary/5'
                                    : 'border-default bg-muted/30 hover:border-primary/50',
                            ]"
                            @click="form.type = 'email'"
                        >
                            <UIcon
                                name="i-lucide-mail"
                                :class="['size-6', form.type === 'email' ? 'text-primary' : 'text-muted']"
                            />
                            <span
                                :class="['text-sm font-semibold', form.type === 'email' ? 'text-primary' : 'text-muted']"
                            >
                                Email Direct
                            </span>
                        </button>
                        <button
                            type="button"
                            :class="[
                                'flex flex-col items-center gap-2 p-4 rounded-lg border-2 cursor-pointer transition-all',
                                form.type === 'whatsapp'
                                    ? 'border-primary bg-primary/5'
                                    : 'border-default bg-muted/30 hover:border-primary/50',
                            ]"
                            @click="form.type = 'whatsapp'"
                        >
                            <UIcon
                                name="i-lucide-message-circle"
                                :class="['size-6', form.type === 'whatsapp' ? 'text-primary' : 'text-muted']"
                            />
                            <span
                                :class="['text-sm font-semibold', form.type === 'whatsapp' ? 'text-primary' : 'text-muted']"
                            >
                                WhatsApp Link
                            </span>
                        </button>
                    </div>
                </div>

                <!-- Subject (email only) -->
                <div v-if="form.type === 'email'" class="flex flex-col gap-2">
                    <label class="text-xs font-bold text-muted uppercase tracking-wider">
                        Oggetto
                    </label>
                    <UInput
                        v-model="form.subject"
                        placeholder="es. {{event_name}} - Ci fai sapere?"
                        size="lg"
                    />
                </div>

                <!-- Message body -->
                <div class="flex flex-col gap-3">
                    <div class="flex items-center justify-between">
                        <label class="text-xs font-bold text-muted uppercase tracking-wider">
                            Corpo del Messaggio
                        </label>
                        <span class="text-xs text-muted">Supporta tag dinamici</span>
                    </div>

                    <!-- Variable tags toolbar -->
                    <div class="flex flex-wrap gap-2 p-2.5 bg-muted/30 rounded-t-lg border border-b-0 border-default">
                        <button
                            v-for="tag in variableTags"
                            :key="tag.key"
                            type="button"
                            class="px-3 py-1.5 text-xs font-medium rounded-full flex items-center gap-1 transition-colors bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20"
                            @click="insertVariable(tag.key)"
                        >
                            <UIcon name="i-lucide-plus" class="size-3" />
                            {{ tag.label }}
                        </button>
                    </div>

                    <!-- Textarea -->
                    <UTextarea
                        ref="textareaRef"
                        v-model="form.body"
                        :rows="8"
                        class="-mt-3 [&_textarea]:rounded-t-none"
                        placeholder="Scrivi qui il tuo messaggio..."
                    />
                </div>
            </div>

            <!-- Suggestion box -->
            <div class="bg-primary/5 border border-primary/20 rounded-xl p-4 flex gap-4">
                <UIcon name="i-lucide-info" class="size-5 text-primary shrink-0 mt-0.5" />
                <div>
                    <h4 class="text-sm font-bold">Suggerimento Ceremly</h4>
                    <p class="text-sm text-muted mt-1 leading-relaxed">
                        I messaggi brevi e personali hanno un tasso di risposta superiore del 40%.
                        Ricordati di includere sempre il link diretto per facilitare l'invitato.
                    </p>
                </div>
            </div>

        </div>

        <!-- Right Column: Preview (hidden on mobile) -->
        <div class="hidden lg:block lg:col-span-5">
            <div class="sticky top-24">
                <!-- Preview header -->
                <div class="flex items-center justify-between mb-6">
                    <h3 class="text-xs font-bold text-muted uppercase tracking-wider">Anteprima Real-time</h3>
                    <div class="flex items-center gap-1 text-xs text-muted">
                        <UIcon name="i-lucide-smartphone" class="size-3.5" />
                        Mobile view
                    </div>
                </div>

                <!-- Phone mockup -->
                <div class="relative mx-auto w-[300px] h-[600px] bg-gray-900 rounded-[3rem] border-8 border-gray-800 shadow-2xl overflow-hidden ring-4 ring-default">
                    <!-- Notch -->
                    <div class="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-5 bg-gray-900 rounded-b-full z-20" />

                    <!-- Screen header -->
                    <div class="absolute top-0 w-full h-14 bg-gray-100 flex items-end justify-center pb-2 z-10">
                        <span class="text-[10px] font-bold text-gray-400">Ceremly Messenger</span>
                    </div>

                    <!-- Screen content: Email view -->
                    <div v-if="form.type === 'email'" class="mt-14 h-[calc(100%-3.5rem)] bg-white p-4 overflow-y-auto scrollbar-hide">
                        <!-- Subject -->
                        <div class="mb-4">
                            <div class="text-[10px] text-gray-400 uppercase font-bold mb-1">Oggetto:</div>
                            <div class="text-xs font-semibold text-gray-800 border-b border-gray-100 pb-2">
                                {{ previewSubject }}
                            </div>
                        </div>

                        <!-- Sender info -->
                        <div class="flex items-center gap-2 mb-4">
                            <div class="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                                <span class="text-primary font-bold text-[10px]">CM</span>
                            </div>
                            <div class="flex flex-col">
                                <span class="text-[10px] font-bold text-gray-800">Ceremly</span>
                                <span class="text-[8px] text-gray-400">a: {{ previewVariables.guest_name }}</span>
                            </div>
                        </div>

                        <!-- Body -->
                        <div class="space-y-3">
                            <p
                                v-for="(paragraph, i) in previewBody.split('\n\n').filter(Boolean)"
                                :key="i"
                                class="text-[11px] leading-relaxed text-gray-700"
                            >
                                {{ paragraph }}
                            </p>
                        </div>

                        <!-- CTA button -->
                        <div class="py-4">
                            <div class="w-full bg-primary text-white text-[11px] font-bold py-3 rounded-lg text-center shadow-md">
                                Conferma la tua presenza
                            </div>
                        </div>
                    </div>

                    <!-- Screen content: WhatsApp view -->
                    <div v-else class="mt-14 h-[calc(100%-3.5rem)] bg-[#e5ddd5] p-3 overflow-y-auto scrollbar-hide">
                        <!-- WhatsApp header -->
                        <div class="flex items-center gap-2 mb-4">
                            <div class="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                                <UIcon name="i-lucide-message-circle" class="size-4 text-white" />
                            </div>
                            <div class="flex flex-col">
                                <span class="text-[10px] font-bold text-gray-800">{{ previewVariables.event_name }}</span>
                                <span class="text-[8px] text-gray-500">Online</span>
                            </div>
                        </div>

                        <!-- Chat bubble -->
                        <div class="bg-white rounded-lg rounded-tl-none p-3 shadow-sm max-w-[85%]">
                            <div class="space-y-2">
                                <p
                                    v-for="(paragraph, i) in previewBody.split('\n\n').filter(Boolean)"
                                    :key="i"
                                    class="text-[11px] leading-relaxed text-gray-800"
                                >
                                    {{ paragraph }}
                                </p>
                            </div>
                            <div class="text-[8px] text-gray-400 text-right mt-1">
                                {{ new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) }}
                            </div>
                        </div>
                    </div>

                    <!-- Home indicator -->
                    <div class="absolute bottom-2 left-1/2 -translate-x-1/2 w-24 h-1 bg-gray-300 rounded-full" />
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.scrollbar-hide::-webkit-scrollbar {
    display: none;
}
.scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
}
</style>
