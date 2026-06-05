<script setup lang="ts">
const { t, locale } = useI18n()
const toast = useToast()

const email = ref('')
const honeypot = ref('')
const loading = ref(false)
const submitted = ref(false)
const formLoadedAt = ref(0)

onMounted(() => {
  formLoadedAt.value = Date.now()
})

async function onSubmit() {
  if (!email.value || submitted.value) return

  loading.value = true
  try {
    const language = locale.value.startsWith('it') ? 'it' : 'en'
    const data = await $fetch('/api/waiting-list/subscribe', {
      method: 'POST',
      body: {
        email: email.value,
        language,
        website: honeypot.value,
        _t: formLoadedAt.value,
        source: 'blog-newsletter',
      },
    })

    if (data?.alreadySubscribed) {
      toast.add({
        title: t('blog.newsletter.alreadySubscribed'),
        color: 'warning',
      })
    } else {
      toast.add({
        title: t('blog.newsletter.successTitle'),
        description: t('blog.newsletter.successDescription'),
        color: 'success',
        icon: 'i-lucide-check-circle',
      })
      submitted.value = true
    }
    email.value = ''
  } catch {
    toast.add({
      title: t('blog.newsletter.errorTitle'),
      description: t('blog.newsletter.errorDescription'),
      color: 'error',
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="my-16">
    <div class="mx-auto max-w-4xl rounded-3xl bg-gradient-to-r from-primary-500 to-primary-700 px-8 py-12 text-center shadow-2xl shadow-primary-500/20 md:px-16 md:py-16">
      <h2 class="mb-3 text-2xl font-bold text-white md:text-3xl">
        {{ t('blog.newsletter.title') }}
      </h2>
      <p class="mb-8 text-base text-white/80">
        {{ t('blog.newsletter.description') }}
      </p>

      <form class="mx-auto flex max-w-md flex-col gap-3 sm:flex-row" @submit.prevent="onSubmit">
        <!-- Honeypot -->
        <div class="blog-hp" aria-hidden="true" tabindex="-1">
          <input v-model="honeypot" type="text" name="website" autocomplete="off" tabindex="-1">
        </div>

        <input
          v-model="email"
          type="email"
          :placeholder="t('blog.newsletter.placeholder')"
          required
          :disabled="loading || submitted"
          class="w-full rounded-lg border-0 px-4 py-3 text-gray-900 shadow-sm placeholder:text-gray-400 focus:ring-2 focus:ring-white sm:text-sm"
        >

        <button
          type="submit"
          :disabled="loading || submitted || !email"
          class="shrink-0 rounded-lg bg-white px-6 py-3 text-sm font-bold text-primary-600 shadow-sm hover:bg-gray-50 transition-all disabled:opacity-60"
        >
          {{ submitted ? t('blog.newsletter.subscribed') : t('blog.newsletter.subscribe') }}
        </button>
      </form>

      <p class="mt-4 text-xs text-white/60">
        {{ t('blog.newsletter.privacy') }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.blog-hp {
  position: absolute;
  left: -9999px;
  top: -9999px;
  width: 0;
  height: 0;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}
</style>
