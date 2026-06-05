<script setup lang="ts">
import QRCode from 'qrcode'

const props = defineProps<{
    uri: string
}>()

const qrCodeDataUrl = ref('')

watch(() => props.uri, async (newUri) => {
    if (newUri) {
        qrCodeDataUrl.value = await QRCode.toDataURL(newUri, {
            width: 200,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#ffffff',
            },
        })
    }
}, { immediate: true })
</script>

<template>
    <img
        v-if="qrCodeDataUrl"
        :src="qrCodeDataUrl"
        alt="2FA QR Code"
        class="w-48 h-48"
    />
    <div v-else class="w-48 h-48 flex items-center justify-center bg-muted rounded-lg">
        <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin" />
    </div>
</template>
