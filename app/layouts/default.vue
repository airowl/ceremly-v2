<script setup lang="ts">
useHead({
    link: [
        {
            rel: 'stylesheet',
            href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL@20..48,100..700,0..1&display=swap',
        },
    ],
})
</script>

<template>
    <div class="bg-[#FAF9F6] text-primary-900">
        <LandingAppHeader />

        <main>
            <slot />
        </main>

        <LandingAppFooter />
    </div>
</template>
