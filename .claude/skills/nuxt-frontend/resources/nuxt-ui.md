# Nuxt UI

## Table of Contents
- [Overview](#overview)
- [Core Components](#core-components)
- [Form Components](#form-components)
- [Layout Components](#layout-components)
- [Feedback Components](#feedback-components)
- [Theming](#theming)

---

## Overview

YourSaaS uses Nuxt UI v3 for consistent, accessible UI components:

- **Documentation**: https://ui.nuxt.com
- **Auto-import**: All components are auto-imported with `U` prefix
- **Styling**: Built on Tailwind CSS
- **Customization**: Via `app.config.ts` or component props

### Configuration

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
    modules: ['@nuxt/ui'],
    ui: {
        // Global UI configuration
    },
});
```

---

## Core Components

### UButton

Primary action component.

```vue
<template>
    <!-- Basic -->
    <UButton>Click me</UButton>

    <!-- Variants -->
    <UButton variant="solid">Solid</UButton>
    <UButton variant="outline">Outline</UButton>
    <UButton variant="ghost">Ghost</UButton>
    <UButton variant="link">Link</UButton>

    <!-- Colors -->
    <UButton color="primary">Primary</UButton>
    <UButton color="error">Error</UButton>
    <UButton color="success">Success</UButton>
    <UButton color="warning">Warning</UButton>

    <!-- Sizes -->
    <UButton size="xs">Extra Small</UButton>
    <UButton size="sm">Small</UButton>
    <UButton size="md">Medium</UButton>
    <UButton size="lg">Large</UButton>

    <!-- States -->
    <UButton :loading="isLoading">Loading</UButton>
    <UButton disabled>Disabled</UButton>

    <!-- With Icon -->
    <UButton icon="i-heroicons-plus">Add</UButton>
    <UButton trailing-icon="i-heroicons-arrow-right">Next</UButton>

    <!-- Icon Only -->
    <UButton icon="i-heroicons-trash" variant="ghost" color="error" />
</template>
```

### UInput

Text input component.

```vue
<template>
    <!-- Basic -->
    <UInput v-model="value" placeholder="Enter text" />

    <!-- Types -->
    <UInput v-model="email" type="email" />
    <UInput v-model="password" type="password" />
    <UInput v-model="date" type="date" />

    <!-- With Icon -->
    <UInput v-model="search" icon="i-heroicons-magnifying-glass" />

    <!-- Sizes -->
    <UInput v-model="value" size="sm" />
    <UInput v-model="value" size="lg" />

    <!-- States -->
    <UInput v-model="value" disabled />
    <UInput v-model="value" readonly />
</template>
```

### UTextarea

Multi-line text input.

```vue
<template>
    <UTextarea
        v-model="description"
        placeholder="Enter description"
        :rows="4"
        autoresize
    />
</template>
```

### USelect

Dropdown selection.

```vue
<script setup lang="ts">
const options = [
    { label: 'Option 1', value: '1' },
    { label: 'Option 2', value: '2' },
    { label: 'Option 3', value: '3' },
];

const selected = ref('1');
</script>

<template>
    <USelect v-model="selected" :options="options" />

    <!-- With placeholder -->
    <USelect
        v-model="selected"
        :options="options"
        placeholder="Select an option"
    />
</template>
```

### UCheckbox

Boolean input.

```vue
<template>
    <UCheckbox v-model="accepted" label="Accept terms" />

    <!-- With description -->
    <UCheckbox v-model="newsletter">
        <template #label>
            <span class="font-medium">Newsletter</span>
        </template>
        <template #description>
            Receive weekly updates
        </template>
    </UCheckbox>
</template>
```

---

## Form Components

### UForm

Form wrapper with validation support.

```vue
<script setup lang="ts">
import * as z from 'zod';
import type { FormSubmitEvent } from '@nuxt/ui';

const schema = z.object({
    email: z.string().email('Invalid email'),
    password: z.string().min(8, 'Minimum 8 characters'),
});

type Schema = z.output<typeof schema>;

const state = reactive({
    email: '',
    password: '',
});

async function onSubmit(event: FormSubmitEvent<Schema>) {
    console.log('Validated data:', event.data);
}
</script>

<template>
    <UForm :schema="schema" :state="state" @submit="onSubmit">
        <UFormField label="Email" name="email" required>
            <UInput v-model="state.email" type="email" />
        </UFormField>

        <UFormField label="Password" name="password" required>
            <UInput v-model="state.password" type="password" />
        </UFormField>

        <UButton type="submit">Submit</UButton>
    </UForm>
</template>
```

### UFormField

Field wrapper with label and error display.

```vue
<template>
    <!-- Basic -->
    <UFormField label="Name" name="name">
        <UInput v-model="state.name" />
    </UFormField>

    <!-- Required -->
    <UFormField label="Email" name="email" required>
        <UInput v-model="state.email" />
    </UFormField>

    <!-- With hint -->
    <UFormField label="Password" name="password" hint="Min 8 characters">
        <UInput v-model="state.password" type="password" />
    </UFormField>

    <!-- With description -->
    <UFormField label="Bio" name="bio" description="Tell us about yourself">
        <UTextarea v-model="state.bio" />
    </UFormField>
</template>
```

---

## Layout Components

### UCard

Content container.

```vue
<template>
    <!-- Basic -->
    <UCard>
        <p>Card content</p>
    </UCard>

    <!-- With header and footer -->
    <UCard>
        <template #header>
            <h3 class="text-lg font-semibold">Card Title</h3>
        </template>

        <p>Card content goes here</p>

        <template #footer>
            <div class="flex justify-end gap-2">
                <UButton variant="ghost">Cancel</UButton>
                <UButton>Save</UButton>
            </div>
        </template>
    </UCard>
</template>
```

### UModal

Dialog/modal component.

```vue
<script setup lang="ts">
const isOpen = ref(false);
</script>

<template>
    <UButton @click="isOpen = true">Open Modal</UButton>

    <UModal v-model:open="isOpen">
        <template #header>
            <h3>Modal Title</h3>
        </template>

        <p>Modal content</p>

        <template #footer>
            <div class="flex justify-end gap-2">
                <UButton variant="ghost" @click="isOpen = false">
                    Cancel
                </UButton>
                <UButton @click="handleSave">Save</UButton>
            </div>
        </template>
    </UModal>
</template>
```

### UDashboardPanel

Dashboard layout panel.

```vue
<template>
    <UDashboardPanel>
        <template #header>
            <div class="flex items-center justify-between">
                <h1 class="text-xl font-bold">Dashboard</h1>
                <UButton icon="i-heroicons-plus">Add</UButton>
            </div>
        </template>

        <!-- Panel content -->
        <div class="space-y-4">
            <UCard v-for="item in items" :key="item.id">
                {{ item.name }}
            </UCard>
        </div>
    </UDashboardPanel>
</template>
```

### UDashboardSidebar

Sidebar navigation.

```vue
<template>
    <UDashboardSidebar>
        <template #header>
            <Logo />
        </template>

        <UDashboardSidebarLinks :links="links" />

        <template #footer>
            <UserMenu />
        </template>
    </UDashboardSidebar>
</template>

<script setup lang="ts">
const links = [
    {
        label: 'Dashboard',
        icon: 'i-heroicons-home',
        to: '/dashboard',
    },
    {
        label: 'Events',
        icon: 'i-heroicons-calendar',
        to: '/dashboard/events',
    },
    {
        label: 'Settings',
        icon: 'i-heroicons-cog-6-tooth',
        to: '/dashboard/settings',
    },
];
</script>
```

---

## Feedback Components

### useToast

Toast notifications.

```vue
<script setup lang="ts">
const toast = useToast();

function showSuccess() {
    toast.add({
        title: 'Success',
        description: 'Operation completed',
        color: 'success',
    });
}

function showError() {
    toast.add({
        title: 'Error',
        description: 'Something went wrong',
        color: 'error',
    });
}

function showWarning() {
    toast.add({
        title: 'Warning',
        description: 'Please review your input',
        color: 'warning',
    });
}

function showInfo() {
    toast.add({
        title: 'Info',
        description: 'New features available',
        color: 'info',
    });
}

// With action
function showWithAction() {
    toast.add({
        title: 'Item deleted',
        description: 'The item was removed',
        color: 'error',
        actions: [
            {
                label: 'Undo',
                click: () => restoreItem(),
            },
        ],
    });
}
</script>
```

### UAlert

Inline alerts.

```vue
<template>
    <!-- Variants -->
    <UAlert color="info" title="Information">
        This is an info message.
    </UAlert>

    <UAlert color="success" title="Success">
        Operation completed successfully.
    </UAlert>

    <UAlert color="warning" title="Warning">
        Please review your settings.
    </UAlert>

    <UAlert color="error" title="Error">
        An error occurred.
    </UAlert>

    <!-- With icon -->
    <UAlert
        color="info"
        icon="i-heroicons-information-circle"
        title="Note"
    >
        Important information here.
    </UAlert>

    <!-- Closable -->
    <UAlert color="warning" title="Notice" closable>
        Click X to dismiss.
    </UAlert>
</template>
```

### UBadge

Status indicators.

```vue
<template>
    <!-- Colors -->
    <UBadge color="primary">Primary</UBadge>
    <UBadge color="success">Active</UBadge>
    <UBadge color="warning">Pending</UBadge>
    <UBadge color="error">Inactive</UBadge>

    <!-- Variants -->
    <UBadge variant="solid">Solid</UBadge>
    <UBadge variant="outline">Outline</UBadge>
    <UBadge variant="soft">Soft</UBadge>
</template>
```

### USkeleton

Loading placeholders.

```vue
<template>
    <!-- While loading -->
    <div v-if="isLoading" class="space-y-4">
        <USkeleton class="h-8 w-1/3" />
        <USkeleton class="h-4 w-full" />
        <USkeleton class="h-4 w-2/3" />
    </div>

    <!-- Content loaded -->
    <div v-else>
        <h1>{{ title }}</h1>
        <p>{{ description }}</p>
    </div>
</template>
```

---

## Theming

### Color Customization

```typescript
// app.config.ts
export default defineAppConfig({
    ui: {
        primary: 'indigo',
        gray: 'slate',
    },
});
```

### Component Customization

```typescript
// app.config.ts
export default defineAppConfig({
    ui: {
        button: {
            default: {
                size: 'md',
                color: 'primary',
            },
        },
        card: {
            base: 'overflow-hidden',
            rounded: 'rounded-xl',
            shadow: 'shadow-lg',
        },
    },
});
```

### Dark Mode

```vue
<script setup lang="ts">
const colorMode = useColorMode();

function toggleDarkMode() {
    colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark';
}
</script>

<template>
    <UButton
        :icon="colorMode.value === 'dark'
            ? 'i-heroicons-sun'
            : 'i-heroicons-moon'"
        variant="ghost"
        @click="toggleDarkMode"
    />
</template>
```

---

## Icon Usage

Nuxt UI uses Heroicons by default:

```vue
<template>
    <!-- In buttons -->
    <UButton icon="i-heroicons-plus" />
    <UButton icon="i-heroicons-trash" color="error" />
    <UButton icon="i-heroicons-pencil-square" />

    <!-- Standalone -->
    <UIcon name="i-heroicons-check-circle" class="text-success-500" />
    <UIcon name="i-heroicons-x-circle" class="text-error-500" />

    <!-- Custom size -->
    <UIcon name="i-heroicons-home" class="w-6 h-6" />
</template>
```

Common icons:
- `i-heroicons-plus` - Add
- `i-heroicons-trash` - Delete
- `i-heroicons-pencil-square` - Edit
- `i-heroicons-eye` - View
- `i-heroicons-magnifying-glass` - Search
- `i-heroicons-check` - Check/Success
- `i-heroicons-x-mark` - Close/Cancel
- `i-heroicons-arrow-right` - Next/Forward
- `i-heroicons-arrow-left` - Back
- `i-heroicons-cog-6-tooth` - Settings
