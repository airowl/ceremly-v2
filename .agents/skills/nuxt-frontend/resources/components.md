# Vue Components

## Table of Contents
- [Overview](#overview)
- [Component Types](#component-types)
- [Component Patterns](#component-patterns)
- [Form Components](#form-components)
- [Modal Components](#modal-components)
- [Best Practices](#best-practices)

---

## Overview

YourSaaS uses Vue 3 with Composition API and TypeScript:

- **Location**: `fe/app/components/`
- **Script**: Always `<script setup lang="ts">`
- **Styling**: Nuxt UI + Tailwind CSS
- **Client-only**: Use `.client.vue` suffix

### Basic Template

```vue
<script setup lang="ts">
// Imports (auto-imported by Nuxt)
const props = defineProps<{
    title: string;
    items?: string[];
}>();

const emit = defineEmits<{
    close: [];
    submit: [data: FormData];
}>();

// Composables and stores
const toast = useToast();
const userStore = useUserStore();

// State
const isLoading = ref(false);

// Computed
const hasItems = computed(() => (props.items?.length ?? 0) > 0);

// Methods
async function handleSubmit() {
    isLoading.value = true;
    // ...
}
</script>

<template>
    <div class="p-4">
        <h1>{{ title }}</h1>
        <UButton @click="emit('close')">Close</UButton>
    </div>
</template>
```

---

## Component Types

### Universal Components

Standard `.vue` files, render on both server and client:

```vue
<!-- components/landing/Features.vue -->
<script setup lang="ts">
const features = [
    { title: 'Feature 1', description: 'Description 1' },
    { title: 'Feature 2', description: 'Description 2' },
];
</script>

<template>
    <section class="py-16">
        <div v-for="feature in features" :key="feature.title">
            {{ feature.title }}
        </div>
    </section>
</template>
```

### Client-Only Components

Use `.client.vue` suffix for browser-only components:

```vue
<!-- components/admin/events/AddEventModal.client.vue -->
<script setup lang="ts">
// Safe to use browser APIs
const { $supabase } = useNuxtApp();

onMounted(() => {
    // DOM is available
    document.body.classList.add('modal-open');
});
</script>
```

**When to use `.client.vue`:**
- Components using browser APIs (`window`, `document`)
- Components with heavy client-side interactivity
- Forms with client-side validation
- Components accessing Supabase client

### Server Components

Use `.server.vue` for server-only rendering:

```vue
<!-- components/charts/Analytics.server.vue -->
<script setup lang="ts">
// This runs only on server
const data = await $fetch('/api/analytics');
</script>
```

---

## Component Patterns

### Props and Emits

```vue
<script setup lang="ts">
// Props with types
interface Props {
    eventId: string;
    isOpen: boolean;
    initialData?: EventData;
}

const props = withDefaults(defineProps<Props>(), {
    initialData: undefined,
});

// Typed emits
interface Emits {
    (e: 'close'): void;
    (e: 'save', data: EventData): void;
    (e: 'update:isOpen', value: boolean): void;
}

const emit = defineEmits<Emits>();

// v-model pattern
const isOpenModel = computed({
    get: () => props.isOpen,
    set: (value) => emit('update:isOpen', value),
});
</script>
```

### Provide/Inject Pattern

For parent-child data sharing:

```vue
<!-- Parent: pages/dashboard/workspace/[id]/events.vue -->
<script setup lang="ts">
const workspaceStore = useWorkspaceStore();

async function refreshEvents() {
    await workspaceStore.refreshEventsAndUsage();
}

// Provide to children
provide('refreshEvents', refreshEvents);
provide('workspaceId', computed(() => route.params.id));
</script>

<!-- Child: components/admin/events/AddEventModal.client.vue -->
<script setup lang="ts">
const refreshEvents = inject<() => Promise<void>>('refreshEvents');
const workspaceId = inject<ComputedRef<string>>('workspaceId');

async function onSuccess() {
    await refreshEvents?.();
    emit('close');
}
</script>
```

### Slots Pattern

```vue
<!-- components/ui/Card.vue -->
<script setup lang="ts">
defineProps<{
    title?: string;
}>();
</script>

<template>
    <UCard>
        <template v-if="$slots.header || title" #header>
            <slot name="header">
                <h3 class="text-lg font-semibold">{{ title }}</h3>
            </slot>
        </template>

        <slot />

        <template v-if="$slots.footer" #footer>
            <slot name="footer" />
        </template>
    </UCard>
</template>
```

---

## Form Components

### With Zod Validation

```vue
<!-- components/admin/events/EventForm.client.vue -->
<script setup lang="ts">
import * as z from 'zod';
import type { FormSubmitEvent } from '@nuxt/ui';

const props = defineProps<{
    workspaceId: string;
    initialData?: Partial<EventData>;
}>();

const emit = defineEmits<{
    success: [event: EventData];
    cancel: [];
}>();

// Validation schema
const schema = z.object({
    name: z.string()
        .min(2, 'Nome troppo corto')
        .max(100, 'Nome troppo lungo'),
    description: z.string().optional(),
    date: z.string().optional(),
    location: z.string().optional(),
});

type Schema = z.output<typeof schema>;

// Form state
const state = reactive<Partial<Schema>>({
    name: props.initialData?.name ?? '',
    description: props.initialData?.description ?? '',
    date: props.initialData?.date ?? '',
    location: props.initialData?.location ?? '',
});

const isSubmitting = ref(false);
const toast = useToast();
const { $supabase } = useNuxtApp();

async function onSubmit(event: FormSubmitEvent<Schema>) {
    isSubmitting.value = true;

    try {
        const { data, error } = await $supabase.functions.invoke('events', {
            body: {
                ...event.data,
                workspace_id: props.workspaceId,
            },
        });

        if (error) throw error;

        toast.add({
            title: 'Successo',
            description: 'Evento creato con successo',
            color: 'success',
        });

        emit('success', data);
    } catch (error) {
        toast.add({
            title: 'Errore',
            description: error instanceof Error ? error.message : 'Errore sconosciuto',
            color: 'error',
        });
    } finally {
        isSubmitting.value = false;
    }
}
</script>

<template>
    <UForm :schema="schema" :state="state" @submit="onSubmit">
        <UFormField label="Nome evento" name="name" required>
            <UInput v-model="state.name" placeholder="Nome dell'evento" />
        </UFormField>

        <UFormField label="Descrizione" name="description">
            <UTextarea v-model="state.description" placeholder="Descrizione opzionale" />
        </UFormField>

        <UFormField label="Data" name="date">
            <UInput v-model="state.date" type="date" />
        </UFormField>

        <div class="flex justify-end gap-2 mt-4">
            <UButton variant="ghost" @click="emit('cancel')">
                Annulla
            </UButton>
            <UButton type="submit" :loading="isSubmitting">
                Salva
            </UButton>
        </div>
    </UForm>
</template>
```

---

## Modal Components

### Standard Modal Pattern

```vue
<!-- components/admin/ConfirmDialog.client.vue -->
<script setup lang="ts">
const props = defineProps<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info';
}>();

const emit = defineEmits<{
    'update:isOpen': [value: boolean];
    confirm: [];
    cancel: [];
}>();

const isOpenModel = computed({
    get: () => props.isOpen,
    set: (value) => emit('update:isOpen', value),
});

function handleConfirm() {
    emit('confirm');
    isOpenModel.value = false;
}

function handleCancel() {
    emit('cancel');
    isOpenModel.value = false;
}
</script>

<template>
    <UModal v-model:open="isOpenModel">
        <template #header>
            <h3 class="text-lg font-semibold">{{ title }}</h3>
        </template>

        <p class="text-gray-600">{{ message }}</p>

        <template #footer>
            <div class="flex justify-end gap-2">
                <UButton variant="ghost" @click="handleCancel">
                    {{ cancelText ?? 'Annulla' }}
                </UButton>
                <UButton
                    :color="variant === 'danger' ? 'error' : 'primary'"
                    @click="handleConfirm"
                >
                    {{ confirmText ?? 'Conferma' }}
                </UButton>
            </div>
        </template>
    </UModal>
</template>
```

### Modal with Form

```vue
<!-- components/admin/guests/InviteGuestModal.client.vue -->
<script setup lang="ts">
import * as z from 'zod';

const props = defineProps<{
    eventId: string;
}>();

const isOpen = defineModel<boolean>('open', { default: false });

const schema = z.object({
    email: z.string().email('Email non valida'),
    name: z.string().min(2, 'Nome richiesto'),
});

const state = reactive({
    email: '',
    name: '',
});

const isSubmitting = ref(false);
const toast = useToast();
const { $supabase } = useNuxtApp();

// Inject refresh function from parent
const refreshGuests = inject<() => Promise<void>>('refreshGuests');

async function onSubmit() {
    isSubmitting.value = true;

    try {
        const { error } = await $supabase.functions.invoke('guests', {
            body: {
                event_id: props.eventId,
                email: state.email,
                name: state.name,
            },
        });

        if (error) throw error;

        toast.add({
            title: 'Invito inviato',
            color: 'success',
        });

        // Refresh parent data
        await refreshGuests?.();

        // Reset and close
        state.email = '';
        state.name = '';
        isOpen.value = false;
    } catch (error) {
        toast.add({
            title: 'Errore',
            description: error instanceof Error ? error.message : 'Errore',
            color: 'error',
        });
    } finally {
        isSubmitting.value = false;
    }
}
</script>

<template>
    <UModal v-model:open="isOpen">
        <template #header>
            <h3>Invita ospite</h3>
        </template>

        <UForm :schema="schema" :state="state" @submit="onSubmit">
            <UFormField label="Email" name="email" required>
                <UInput v-model="state.email" type="email" />
            </UFormField>

            <UFormField label="Nome" name="name" required>
                <UInput v-model="state.name" />
            </UFormField>

            <div class="flex justify-end gap-2 mt-4">
                <UButton variant="ghost" @click="isOpen = false">
                    Annulla
                </UButton>
                <UButton type="submit" :loading="isSubmitting">
                    Invita
                </UButton>
            </div>
        </UForm>
    </UModal>
</template>
```

---

## Best Practices

### Do's

✅ Use `<script setup lang="ts">` always
✅ Use `.client.vue` for browser-only components
✅ Define props and emits with TypeScript
✅ Use Nuxt UI components
✅ Use Zod for form validation
✅ Use provide/inject for cross-component data

### Don'ts

❌ Use Options API
❌ Access browser APIs in universal components
❌ Forget to handle loading states
❌ Mutate props directly
❌ Skip TypeScript typing

### Component Organization

```
components/
├── landing/              # Landing page components
│   ├── Hero.vue
│   ├── Features.vue
│   └── Pricing.vue
├── admin/                # Dashboard components
│   ├── Sidebar.client.vue
│   ├── events/
│   │   ├── EventList.client.vue
│   │   └── AddEventModal.client.vue
│   └── guests/
│       └── GuestTable.client.vue
└── ui/                   # Shared UI components
    ├── Card.vue
    └── EmptyState.vue
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Component file | PascalCase | `AddEventModal.vue` |
| Client-only | PascalCase + `.client` | `AddEventModal.client.vue` |
| Prop | camelCase | `workspaceId` |
| Event | kebab-case | `@update:is-open` |
| CSS class | kebab-case | `event-card` |
