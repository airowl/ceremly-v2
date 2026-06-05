<script setup lang="ts">
import type { LandingSection, LandingSettings } from '~~/shared/schemas/landing'

const props = defineProps<{
    section: LandingSection
    settings: LandingSettings
    slug: string
    guestId?: string
    event?: Record<string, unknown>
}>()
</script>

<template>
    <template v-if="section.enabled">
        <EventHeroSection
            v-if="section.type === 'hero'"
            :values="section.values"
            :settings="settings"
            :event="event"
        />
        <EventDetailsSection
            v-else-if="section.type === 'details'"
            :values="section.values"
            :settings="settings"
            :event="event"
        />
        <EventStorySection
            v-else-if="section.type === 'story'"
            :values="section.values"
            :settings="settings"
        />
        <EventCountdownSection
            v-else-if="section.type === 'countdown'"
            :values="section.values"
            :settings="settings"
            :event="event"
        />
        <EventGallerySection
            v-else-if="section.type === 'gallery'"
            :values="section.values"
            :settings="settings"
        />
        <EventRsvpSection
            v-else-if="section.type === 'rsvp'"
            :values="section.values"
            :settings="settings"
            :slug="slug"
            :guest-id="guestId"
            :event="event"
        />
        <EventRegistrationFormSection
            v-else-if="section.type === 'registration_form'"
            :values="section.values"
            :settings="settings"
            :slug="slug"
            :event="event"
        />
        <EventMapSection
            v-else-if="section.type === 'map'"
            :values="section.values"
            :settings="settings"
            :event="event"
        />
        <EventFooterSection
            v-else-if="section.type === 'footer'"
            :values="section.values"
            :settings="settings"
        />
    </template>
</template>
