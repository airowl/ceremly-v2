<script setup lang="ts">
import { z } from 'zod'

definePageMeta({
    auth: false,
    layout: 'landing',
})

const { t, locale } = useI18n()
const { plans, getFormattedPrice } = usePricing()
const { isActiveMode } = useSiteMode()
const { createCheckoutSession } = useSubscription()
const runtimeConfig = useRuntimeConfig()
const baseUrl = ((runtimeConfig.public.baseURL as string) || '').replace(/\/$/, '')

// SEO Meta - i18n aware
const seoTitle = computed(() => t('landing.seo.title'))
const seoDescription = computed(() => t('landing.seo.description'))

useSeoMeta({
    titleTemplate: '',
    title: seoTitle,
    ogTitle: () => t('landing.seo.ogTitle'),
    description: seoDescription,
    ogDescription: () => t('landing.seo.ogDescription'),
    ogImage: computed(() => locale.value.startsWith('it') ? `${baseUrl}/ogImage-it.png` : `${baseUrl}/ogImage-en.png`),
    ogType: 'website',
})

// Structured Data via nuxt-schema-org
useSchemaOrg([
    defineWebPage({
        '@type': 'FAQPage',
        'name': computed(() => t('landing.seo.title')),
        'description': computed(() => t('landing.seo.description')),
    }),
    {
        '@type': 'SoftwareApplication',
        'name': (runtimeConfig.public.appName as string) || '',
        'applicationCategory': 'BusinessApplication',
        'operatingSystem': 'Web',
        'description': computed(() => t('landing.seo.description')),
        'url': baseUrl,
        'offers': {
            '@type': 'AggregateOffer',
            'priceCurrency': 'EUR',
            'lowPrice': '0',
            'offerCount': '3',
        },
    },
    defineQuestion({
        name: computed(() => t('landing.faq.questions.q1.question')),
        acceptedAnswer: computed(() => t('landing.faq.questions.q1.answer')),
    }),
    defineQuestion({
        name: computed(() => t('landing.faq.questions.q2.question')),
        acceptedAnswer: computed(() => t('landing.faq.questions.q2.answer')),
    }),
    defineQuestion({
        name: computed(() => t('landing.faq.questions.q3.question')),
        acceptedAnswer: computed(() => t('landing.faq.questions.q3.answer')),
    }),
    defineQuestion({
        name: computed(() => t('landing.faq.questions.q4.question')),
        acceptedAnswer: computed(() => t('landing.faq.questions.q4.answer')),
    }),
    defineQuestion({
        name: computed(() => t('landing.faq.questions.q5.question')),
        acceptedAnswer: computed(() => t('landing.faq.questions.q5.answer')),
    }),
    defineQuestion({
        name: computed(() => t('landing.faq.questions.q6.question')),
        acceptedAnswer: computed(() => t('landing.faq.questions.q6.answer')),
    }),
])


// Waitlist form
const schema = z.object({
    email: z.string().email(t('landing.waitingList.validation.invalidEmail')),
})

const waitlistState = reactive({ email: '', website: '' })
const loading = ref(false)
const submitted = ref(false)
const formLoadedAt = ref(0)
const referrerSource = ref('')
const utmSource = ref('')
const utmMedium = ref('')
const utmCampaign = ref('')

onMounted(() => {
    formLoadedAt.value = Date.now()
    referrerSource.value = document.referrer || ''
    const params = new URLSearchParams(window.location.search)
    utmSource.value = params.get('utm_source') || ''
    utmMedium.value = params.get('utm_medium') || ''
    utmCampaign.value = params.get('utm_campaign') || ''
})

const toast = useToast()

useScrollReveal()

async function submitWaitlist() {
    const result = schema.safeParse({ email: waitlistState.email })
    if (!result.success) {
        toast.add({ title: t('landing.waitingList.errorTitle'), description: result.error.issues[0]?.message, color: 'error' })
        return
    }
    loading.value = true
    try {
        const language = locale.value.startsWith('it') ? 'it' : 'en'
        const data = await $fetch('/api/waiting-list/subscribe', {
            method: 'POST',
            body: {
                email: waitlistState.email,
                language,
                website: waitlistState.website,
                _t: formLoadedAt.value,
                source: referrerSource.value || undefined,
                utmSource: utmSource.value || undefined,
                utmMedium: utmMedium.value || undefined,
                utmCampaign: utmCampaign.value || undefined,
            },
        })
        if (data?.alreadySubscribed) {
            toast.add({ title: t('landing.waitingList.alreadySubscribedTitle'), description: t('landing.waitingList.alreadySubscribedMessage'), color: 'warning' })
            waitlistState.email = ''
            loading.value = false
            return
        }
        submitted.value = true
        waitlistState.email = ''
        toast.add({ title: t('landing.waitingList.successTitle'), description: data?.emailSent ? t('landing.waitingList.successMessage') : t('landing.waitingList.successMessageNoEmail'), color: 'success' })
    } catch (error: any) {
        toast.add({ title: t('landing.waitingList.errorTitle'), description: error?.data?.message || t('landing.waitingList.errorMessage'), color: 'error' })
    } finally {
        loading.value = false
    }
}

// Pricing
const billingCycle = ref<'monthly' | 'yearly'>('monthly')
const yearlySavings = computed(() => {
    const starter = plans.value.find(p => p.id === 'starter')
    return starter?.pricing.yearlySavingsPercent || 17
})
const checkoutLoading = ref(false)

async function handleCheckout(planId: string) {
    checkoutLoading.value = true
    try {
        await createCheckoutSession(`${planId}-${billingCycle.value}`)
    } catch {
        // Not authenticated: redirect to signup with plan pre-selected
        await navigateTo(`/signup?plan=${planId}&billing=${billingCycle.value}`)
    } finally {
        checkoutLoading.value = false
    }
}

// FAQ
const openFaq = ref(0)

function scrollToWaitlist() {
    document.getElementById('waitlist-hero')?.scrollIntoView({ behavior: 'smooth' })
}
</script>

<template>
    <div>
        <!-- ═══ HERO ═══ -->
        <section class="relative overflow-hidden pt-16 pb-20 sm:pt-24 lg:pb-32">
            <div class="mx-auto max-w-7xl px-6 lg:px-8">
                <div class="grid gap-16 lg:grid-cols-2 lg:items-center">
                    <div class="relative z-10 max-w-2xl">
                        <div class="hero-fade-up anim-delay-100 mb-6 inline-flex items-center gap-2 rounded-full border border-primary-500/20 bg-primary-500/5 px-3 py-1 text-sm font-medium text-primary-500">
                            <span class="flex h-2 w-2 rounded-full bg-primary-500" />
                            {{ t('landing.hero.badge') }}
                        </div>

                        <h1 class="hero-fade-up anim-delay-200 text-4xl font-extrabold tracking-tight sm:text-6xl mb-6 leading-[1.15]">
                            {{ t('landing.hero.title') }} <span class="text-primary-500">{{ t('landing.hero.titleHighlight') }}</span>.
                        </h1>

                        <p class="hero-fade-up anim-delay-300 mb-8 text-lg text-primary-700">
                            {{ t('landing.hero.subtitle') }}
                        </p>

                        <div class="hero-fade-up anim-delay-400 flex flex-col gap-4 sm:flex-row items-start">
                            <button
                                class="h-12 w-full sm:w-auto rounded-lg bg-primary-500 px-8 text-base font-bold text-white shadow-xl shadow-primary-500/20 hover:bg-primary-600 transition-all"
                                @click="isActiveMode ? navigateTo('/signup') : scrollToWaitlist()"
                            >
                                {{ t('landing.hero.cta') }}
                            </button>
                            <!-- <button class="h-12 w-full sm:w-auto flex items-center justify-center gap-2 rounded-lg border border-[#cfe2e8] bg-white px-6 text-base font-bold hover:bg-gray-50 transition-colors">
                                <span class="material-symbols-outlined text-primary-500">play_circle</span>
                                {{ t('landing.hero.ctaSecondary') }}
                            </button> -->
                        </div>

                        <!-- Social Proof -->
                        <!-- <div class="hero-fade-up anim-delay-500 mt-10 flex items-center gap-4">
                            <div class="flex -space-x-3">
                                <img v-for="(avatar, i) in avatars" :key="i" :src="avatar" alt="Avatar utente" class="inline-block h-10 w-10 rounded-full ring-2 ring-white object-cover">
                                <div class="flex h-10 w-10 items-center justify-center rounded-full bg-secondary-500 ring-2 ring-white text-xs font-bold text-white">
                                    {{ t('landing.hero.socialProofCount') }}
                                </div>
                            </div>
                            <div class="flex flex-col">
                                <div class="flex items-center gap-1">
                                    <span v-for="i in 5" :key="i" class="material-symbols-outlined text-sm text-yellow-400" style="font-variation-settings: 'FILL' 1;">star</span>
                                </div>
                                <p class="text-sm font-medium">
                                    <span class="font-bold text-secondary-500">{{ t('landing.hero.socialProofUsers') }}</span> {{ t('landing.hero.socialProofText') }}
                                </p>
                            </div>
                        </div> -->
                    </div>

                    <!-- Hero Mockup -->
                    <div class="hero-scale-in anim-delay-400 relative lg:ml-auto">
                        <div class="absolute -top-20 -right-20 -z-10 h-[500px] w-[500px] rounded-full bg-primary-500/10 blur-3xl" />
                        <div class="absolute top-40 -left-20 -z-10 h-[400px] w-[400px] rounded-full bg-secondary-500/10 blur-3xl" />

                        <div class="relative rounded-2xl border border-primary-200 bg-cornsilk-50 p-2 shadow-2xl">
                            <div class="relative overflow-hidden rounded-xl bg-papaya-50">
                                <div class="absolute top-0 w-full h-full bg-linear-to-br from-primary-500/5 to-transparent" />
                                <div class="flex items-center justify-between border-b border-primary-100 bg-cornsilk-50 px-6 py-4">
                                    <div class="flex items-center gap-2">
                                        <div class="h-3 w-3 rounded-full bg-red-400" />
                                        <div class="h-3 w-3 rounded-full bg-yellow-400" />
                                        <div class="h-3 w-3 rounded-full bg-green-400" />
                                    </div>
                                    <div class="h-2 w-32 rounded-full bg-gray-100" />
                                </div>
                                <div class="p-6 grid gap-6">
                                    <div class="flex items-center gap-4 rounded-xl bg-cornsilk-50 p-4 shadow-sm border border-primary-100 animate-[pulse_3s_infinite]">
                                        <div class="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-secondary-500">
                                            <span class="material-symbols-outlined">chat</span>
                                        </div>
                                        <div class="flex-1">
                                            <p class="text-sm font-bold text-gray-900">{{ t('landing.hero.mockup.whatsappTitle') }}</p>
                                            <p class="text-xs text-gray-500">{{ t('landing.hero.mockup.whatsappDesc') }}</p>
                                        </div>
                                        <span class="text-xs font-medium text-gray-400">{{ t('landing.hero.mockup.whatsappTime') }}</span>
                                    </div>
                                    <div class="flex items-center gap-4 rounded-xl bg-cornsilk-50 p-4 shadow-sm border border-primary-100 opacity-60">
                                        <div class="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-primary-500">
                                            <span class="material-symbols-outlined">mail</span>
                                        </div>
                                        <div class="flex-1">
                                            <p class="text-sm font-bold text-gray-900">{{ t('landing.hero.mockup.emailTitle') }}</p>
                                            <p class="text-xs text-gray-500">{{ t('landing.hero.mockup.emailDesc') }}</p>
                                        </div>
                                        <span class="text-xs font-medium text-gray-400">{{ t('landing.hero.mockup.emailTime') }}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Floating badge -->
                        <div class="absolute -bottom-6 -left-6 rounded-xl bg-cornsilk-50 p-4 shadow-xl border border-primary-100 max-w-[200px] animate-float">
                            <div class="flex items-center gap-2 mb-2">
                                <span class="material-symbols-outlined text-secondary-500">check_circle</span>
                                <span class="text-sm font-bold text-gray-900">{{ t('landing.hero.mockup.rsvpComplete') }}</span>
                            </div>
                            <div class="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                                <div class="h-full w-[85%] rounded-full bg-secondary-500" />
                            </div>
                            <div class="mt-1 flex justify-between text-xs text-gray-500">
                                <span>{{ t('landing.hero.mockup.rsvpPercent') }}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- ═══ WAITLIST HERO CTA ═══ -->
        <section v-if="!isActiveMode" id="waitlist-hero" class="reveal reveal-up relative -mt-10 mb-16 px-6 lg:px-8 z-20">
            <div class="mx-auto max-w-4xl rounded-2xl bg-linear-to-r from-primary-500 to-primary-600 p-8 md:p-12 shadow-2xl shadow-primary-500/30">
                <div class="flex flex-col md:flex-row items-center gap-8 justify-between">
                    <div class="text-white md:w-1/2">
                        <h3 class="text-2xl font-bold mb-2">{{ t('landing.waitlistHero.title') }}</h3>
                        <p class="text-white/90 text-sm md:text-base">{{ t('landing.waitlistHero.description') }}</p>
                    </div>
                    <div class="w-full md:w-1/2">
                        <ClientOnly>
                            <form class="flex flex-col sm:flex-row gap-3" @submit.prevent="submitWaitlist">
                                <!-- Honeypot -->
                                <div class="wl-hp" aria-hidden="true" tabindex="-1">
                                    <input v-model="waitlistState.website" type="text" name="website" autocomplete="off" tabindex="-1">
                                </div>
                                <input
                                    v-model="waitlistState.email"
                                    type="email"
                                    :placeholder="t('landing.waitlistHero.placeholder')"
                                    required
                                    :disabled="loading || submitted"
                                    class="w-full rounded-lg border-0 px-4 py-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-white focus:ring-2 focus:ring-inset focus:ring-white sm:text-sm sm:leading-6"
                                >
                                <button
                                    type="submit"
                                    :disabled="loading || submitted"
                                    class="whitespace-nowrap rounded-lg bg-white px-5 py-3 text-sm font-bold text-primary-500 shadow-sm hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white transition-all disabled:opacity-60"
                                >
                                    {{ submitted ? t('landing.waitingList.submittedButton') : t('landing.waitlistHero.cta') }}
                                </button>
                            </form>
                            <p class="mt-2 text-xs text-white/70 text-center sm:text-left">{{ t('landing.waitlistHero.privacy') }}</p>
                        </ClientOnly>
                    </div>
                </div>
            </div>
        </section>

        <!-- ═══ FEATURES ═══ -->
        <section id="features" class="bg-papaya-50 py-24">
            <div class="mx-auto max-w-7xl px-6 lg:px-8">
                <div class="reveal reveal-up mx-auto max-w-2xl text-center mb-16">
                    <h2 class="text-base font-semibold leading-7 text-primary-500">{{ t('landing.features.badge') }}</h2>
                    <p class="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{{ t('landing.features.title') }}</p>
                    <p class="mt-6 text-lg leading-8 text-primary-700">{{ t('landing.features.subtitle') }}</p>
                </div>

                <div class="reveal-stagger mx-auto grid max-w-5xl grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
                    <!-- Email 1-click -->
                    <div class="relative flex flex-col gap-4 rounded-2xl border border-primary-200 bg-cornsilk-50 p-8 hover-lift">
                        <div class="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-500/10 text-primary-500">
                            <span class="material-symbols-outlined text-3xl">mark_email_unread</span>
                        </div>
                        <h3 class="text-xl font-bold">{{ t('landing.features.cards.email.title') }}</h3>
                        <p class="text-primary-700">{{ t('landing.features.cards.email.description') }}</p>
                    </div>

                    <!-- WhatsApp Deep Link -->
                    <div class="relative flex flex-col gap-4 rounded-2xl border border-primary-200 bg-cornsilk-50 p-8 hover-lift">
                        <div class="flex h-12 w-12 items-center justify-center rounded-lg bg-secondary-500/10 text-secondary-500">
                            <span class="material-symbols-outlined text-3xl">chat</span>
                        </div>
                        <h3 class="text-xl font-bold">{{ t('landing.features.cards.whatsapp.title') }}</h3>
                        <p class="text-primary-700">{{ t('landing.features.cards.whatsapp.description') }}</p>
                    </div>

                    <!-- Social Proof -->
                    <div class="relative flex flex-col gap-4 rounded-2xl border border-primary-200 bg-cornsilk-50 p-8 hover-lift">
                        <div class="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-500/10 text-orange-500">
                            <span class="material-symbols-outlined text-3xl">groups</span>
                        </div>
                        <h3 class="text-xl font-bold">{{ t('landing.features.cards.socialProof.title') }}</h3>
                        <p class="text-primary-700">{{ t('landing.features.cards.socialProof.description') }}</p>
                    </div>
                </div>
            </div>
        </section>

        <!-- ═══ DASHBOARD SECTION ═══ -->
        <section class="py-24 overflow-hidden">
            <div class="mx-auto max-w-7xl px-6 lg:px-8">
                <div class="grid gap-12 lg:grid-cols-2 lg:items-center">
                    <!-- Mockup -->
                    <div class="reveal reveal-left order-2 lg:order-1">
                        <div class="relative rounded-2xl bg-primary-200 p-2 shadow-lg rotate-1 transform transition-transform hover:rotate-0 duration-500">
                            <div class="overflow-hidden rounded-xl bg-cornsilk-50">
                                <div class="flex flex-col h-[350px] w-full bg-linear-to-br from-papaya-100 to-cornsilk-200">
                                    <div class="p-6 flex flex-col h-full justify-center items-center">
                                        <div class="w-full max-w-sm bg-cornsilk-50 rounded-xl shadow-md p-6">
                                            <div class="flex justify-between items-center mb-6">
                                                <h4 class="font-bold text-gray-800">{{ t('landing.dashboard.mockup.eventName') }}</h4>
                                                <span class="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full">{{ t('landing.dashboard.mockup.active') }}</span>
                                            </div>
                                            <div class="space-y-4">
                                                <div>
                                                    <div class="flex justify-between text-sm mb-1">
                                                        <span class="text-gray-600">{{ t('landing.dashboard.mockup.confirmed') }}</span>
                                                        <span class="font-bold text-gray-900">{{ t('landing.dashboard.mockup.confirmedValue') }}</span>
                                                    </div>
                                                    <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
                                                        <div class="h-full bg-primary-500 w-[84%]" />
                                                    </div>
                                                </div>
                                                <div>
                                                    <div class="flex justify-between text-sm mb-1">
                                                        <span class="text-gray-600">{{ t('landing.dashboard.mockup.waiting') }}</span>
                                                        <span class="font-bold text-gray-900">{{ t('landing.dashboard.mockup.waitingValue') }}</span>
                                                    </div>
                                                    <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
                                                        <div class="h-full bg-yellow-400 w-[12%]" />
                                                    </div>
                                                </div>
                                                <div>
                                                    <div class="flex justify-between text-sm mb-1">
                                                        <span class="text-gray-600">{{ t('landing.dashboard.mockup.declined') }}</span>
                                                        <span class="font-bold text-gray-900">{{ t('landing.dashboard.mockup.declinedValue') }}</span>
                                                    </div>
                                                    <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
                                                        <div class="h-full bg-red-400 w-[4%]" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Text -->
                    <div class="reveal reveal-right order-1 lg:order-2">
                        <div class="mb-4 inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-sm font-medium text-primary-600">
                            <span class="material-symbols-outlined text-[18px]">analytics</span>
                            {{ t('landing.dashboard.badge') }}
                        </div>
                        <h2 class="text-3xl font-bold tracking-tight sm:text-4xl mb-6">{{ t('landing.dashboard.title') }}</h2>
                        <p class="text-lg text-primary-700 mb-8">{{ t('landing.dashboard.description') }}</p>
                        <ul class="space-y-4">
                            <li class="flex items-start gap-3">
                                <span class="material-symbols-outlined text-primary-500 mt-1">check_circle</span>
                                <span>{{ t('landing.dashboard.check1') }}</span>
                            </li>
                            <li class="flex items-start gap-3">
                                <span class="material-symbols-outlined text-primary-500 mt-1">check_circle</span>
                                <span>{{ t('landing.dashboard.check2') }}</span>
                            </li>
                            <li class="flex items-start gap-3">
                                <span class="material-symbols-outlined text-primary-500 mt-1">check_circle</span>
                                <span>{{ t('landing.dashboard.check3') }}</span>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </section>

        <!-- ═══ WHATSAPP SECTION ═══ -->
        <section class="py-24 bg-beige-50 overflow-hidden">
            <div class="mx-auto max-w-7xl px-6 lg:px-8">
                <div class="grid gap-12 lg:grid-cols-2 lg:items-center">
                    <div class="reveal reveal-right">
                        <div class="mb-4 inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-sm font-medium text-secondary-500">
                            <span class="material-symbols-outlined text-[18px]">send</span>
                            {{ t('landing.whatsapp.badge') }}
                        </div>
                        <h2 class="text-3xl font-bold tracking-tight sm:text-4xl mb-6">{{ t('landing.whatsapp.title') }}</h2>
                        <p class="text-lg text-primary-700 mb-8">{{ t('landing.whatsapp.description') }}</p>
                        <div class="flex gap-4">
                            <button class="flex items-center gap-2 text-primary-500 font-bold hover:text-primary-600 transition-colors">
                                {{ t('landing.whatsapp.cta') }}
                                <span class="material-symbols-outlined">arrow_forward</span>
                            </button>
                        </div>
                    </div>

                    <!-- Phone Mockup -->
                    <div class="reveal reveal-left relative">
                        <div class="mx-auto w-[280px] h-[550px] bg-gray-800 rounded-[3rem] border-8 border-gray-900 shadow-2xl overflow-hidden relative">
                            <div class="absolute top-0 w-full h-full bg-[#E5DDD5]">
                                <div class="bg-[#075E54] h-16 w-full flex items-center px-4 text-white gap-3 pt-4">
                                    <span class="material-symbols-outlined">arrow_back</span>
                                    <div class="flex items-center gap-2">
                                        <div class="h-8 w-8 rounded-full bg-gray-300" />
                                        <span class="font-bold text-sm">{{ t('landing.whatsapp.mockup.contactName') }}</span>
                                    </div>
                                </div>
                                <div class="p-4 space-y-4">
                                    <div class="bg-cornsilk-50 p-3 rounded-lg rounded-tl-none shadow-sm max-w-[85%] text-sm text-gray-800">
                                        <p>{{ t('landing.whatsapp.mockup.message1') }}</p>
                                        <p class="mt-2 text-xs text-gray-500">12:30</p>
                                    </div>
                                    <div class="bg-cornsilk-50 p-2 rounded-lg rounded-tl-none shadow-sm max-w-[85%] text-sm text-gray-800">
                                        <div class="bg-gray-100 rounded p-2 mb-2 flex gap-2 items-center">
                                            <div class="h-10 w-10 bg-primary-500 rounded flex items-center justify-center text-white font-bold text-xs">RSVP</div>
                                            <div>
                                                <div class="font-bold text-xs">{{ t('landing.whatsapp.mockup.linkTitle') }}</div>
                                                <div class="text-[10px] text-gray-500">{{ t('landing.whatsapp.mockup.linkUrl') }}</div>
                                            </div>
                                        </div>
                                        <p class="text-blue-500 text-xs">{{ t('landing.whatsapp.mockup.linkCta') }}</p>
                                    </div>
                                    <div class="flex justify-end">
                                        <div class="bg-[#DCF8C6] p-3 rounded-lg rounded-tr-none shadow-sm max-w-[85%] text-sm text-gray-800">
                                            <p>{{ t('landing.whatsapp.mockup.reply') }}</p>
                                            <p class="mt-2 text-xs text-gray-500 text-right">12:35</p>
                                        </div>
                                    </div>
                                </div>
                                <div class="absolute bottom-0 w-full bg-cornsilk-50 p-3 flex gap-2 items-center">
                                    <span class="material-symbols-outlined text-gray-400">add</span>
                                    <div class="flex-1 bg-gray-100 rounded-full h-8 px-3 text-sm flex items-center text-gray-500">{{ t('landing.whatsapp.mockup.inputPlaceholder') }}</div>
                                    <span class="material-symbols-outlined text-[#075E54]">mic</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- ═══ PRICING ═══ -->
        <section id="pricing" class="py-24 bg-primary-50">
            <div class="mx-auto max-w-7xl px-6 lg:px-8">
                <div class="reveal reveal-up mx-auto max-w-2xl text-center mb-16">
                    <h2 class="text-base font-semibold leading-7 text-primary-500">{{ t('landing.pricing.badge') }}</h2>
                    <p class="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{{ t('landing.pricing.title') }}</p>
                </div>

                <!-- Billing Toggle -->
                <div class="flex justify-center mb-10">
                    <div class="inline-flex items-center rounded-full border border-primary-200 bg-white p-1 shadow-sm">
                        <button
                            type="button"
                            :class="[
                                'rounded-full px-5 py-2 text-sm font-medium transition-all duration-200',
                                billingCycle === 'monthly'
                                    ? 'bg-gray-900 text-white shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                            ]"
                            @click="billingCycle = 'monthly'"
                        >
                            {{ t('landing.pricing.billing.monthly') }}
                        </button>
                        <button
                            type="button"
                            :class="[
                                'flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-all duration-200',
                                billingCycle === 'yearly'
                                    ? 'bg-gray-900 text-white shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                            ]"
                            @click="billingCycle = 'yearly'"
                        >
                            {{ t('landing.pricing.billing.yearly') }}
                            <span class="rounded-full bg-primary-500 px-2 py-0.5 text-xs font-semibold text-white">
                                -{{ yearlySavings }}%
                            </span>
                        </button>
                    </div>
                </div>

                <div class="reveal-stagger grid max-w-lg grid-cols-1 gap-8 mx-auto lg:max-w-none lg:grid-cols-3">
                    <div
                        v-for="(plan, index) in plans"
                        :key="plan.id"
                        class="flex flex-col justify-between rounded-3xl bg-cornsilk-50 p-8 xl:p-10 hover-lift"
                        :class="index === 1 ? 'shadow-xl ring-2 ring-primary-500 relative' : 'shadow-sm ring-1 ring-gray-200'"
                    >
                        <div v-if="index === 1" class="absolute -top-4 left-0 right-0 mx-auto w-32 rounded-full bg-primary-500 py-1 text-center text-xs font-bold text-white uppercase tracking-wide">
                            {{ t('landing.pricing.recommended') }}
                        </div>

                        <div>
                            <div class="flex items-center justify-between gap-x-4">
                                <h3 class="text-lg font-bold leading-8">{{ t(`landing.pricing.tiers.${plan.id}.title`) }}</h3>
                            </div>
                            <p class="mt-4 text-sm leading-6 text-primary-700">{{ t(`landing.pricing.tiers.${plan.id}.description`) }}</p>
                            <p class="mt-6 flex items-baseline gap-x-1">
                                <span class="text-4xl font-bold tracking-tight">{{ getFormattedPrice(plan.id, billingCycle) }}</span>
                                <span class="text-sm font-semibold leading-6 text-gray-600">
                                    {{ billingCycle === 'yearly' ? t('landing.pricing.billing.perYear') : t('landing.pricing.billing.perMonth') }}
                                </span>
                            </p>
                            <ul class="mt-8 space-y-3 text-sm leading-6 text-gray-600" role="list">
                                <li v-for="feature in plan.features" :key="feature.key" class="flex gap-x-3">
                                    <span class="material-symbols-outlined text-primary-500 text-sm pt-1">check</span>
                                    <span :class="{ 'font-bold': feature.key.includes('event') }">{{ t(feature.key) }}</span>
                                </li>
                            </ul>
                        </div>

                        <button
                            v-if="isActiveMode"
                            type="button"
                            :disabled="checkoutLoading"
                            class="mt-8 block w-full rounded-md px-3 py-2 text-center text-sm font-bold leading-6 transition-colors disabled:opacity-60"
                            :class="index === 1 ? 'bg-primary-500 text-white shadow-sm hover:bg-primary-600' : 'bg-primary-200 text-primary-900 hover:bg-primary-300'"
                            @click="handleCheckout(plan.id)"
                        >
                            {{ t(`landing.pricing.tiers.${plan.id}.cta`) }}
                        </button>
                        <a
                            v-else
                            href="#waitlist-hero"
                            class="mt-8 block rounded-md px-3 py-2 text-center text-sm font-bold leading-6 transition-colors"
                            :class="index === 1 ? 'bg-primary-500 text-white shadow-sm hover:bg-primary-600' : 'bg-primary-200 text-primary-900 hover:bg-primary-300'"
                        >
                            {{ t(`landing.pricing.tiers.${plan.id}.cta`) }}
                        </a>
                    </div>
                </div>
            </div>
        </section> 

        <!-- ═══ FAQ ═══ -->
        <section id="faq" class="py-24">
            <div class="mx-auto max-w-3xl px-6 lg:px-8">
                <div class="reveal reveal-up text-center mb-12">
                    <h2 class="text-base font-semibold leading-7 text-primary-500">FAQ</h2>
                    <p class="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{{ t('landing.faq.title') }}</p>
                    <p class="mt-4 text-lg text-primary-700">{{ t('landing.faq.subtitle') }}</p>
                </div>

                <div class="reveal reveal-up space-y-4">
                    <div
                        v-for="i in 6"
                        :key="i"
                        class="rounded-2xl border border-primary-200 bg-cornsilk-50 overflow-hidden transition-all"
                    >
                        <button
                            class="flex w-full items-center justify-between gap-4 px-6 py-5 text-left font-semibold text-gray-900 hover:bg-papaya-50 transition-colors"
                            @click="openFaq === i ? openFaq = 0 : openFaq = i"
                        >
                            <span>{{ t(`landing.faq.questions.q${i}.question`) }}</span>
                            <span
                                class="material-symbols-outlined shrink-0 text-primary-500 transition-transform duration-300"
                                :class="{ 'rotate-180': openFaq === i }"
                            >expand_more</span>
                        </button>
                        <div
                            class="grid transition-all duration-300 ease-in-out"
                            :class="openFaq === i ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
                        >
                            <div class="overflow-hidden">
                                <p class="px-6 pb-5 text-primary-700 leading-relaxed">
                                    {{ t(`landing.faq.questions.q${i}.answer`) }}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- ═══ FINAL CTA ═══ -->
        <section v-if="!isActiveMode" class="relative bg-papaya-50 py-24 border-t border-primary-200">
            <div class="reveal reveal-up mx-auto max-w-7xl px-6 lg:px-8 text-center">
                <h2 class="text-3xl font-bold tracking-tight sm:text-4xl">{{ t('landing.finalCta.title') }}</h2>
                <p class="mx-auto mt-6 max-w-xl text-lg leading-8 text-primary-700">{{ t('landing.finalCta.description') }}</p>
                <div class="mt-10 flex items-center justify-center">
                    <ClientOnly>
                        <form class="flex flex-col sm:flex-row gap-3 w-full max-w-md" @submit.prevent="submitWaitlist">
                            <input
                                v-model="waitlistState.email"
                                type="email"
                                :placeholder="t('landing.finalCta.placeholder')"
                                required
                                :disabled="loading || submitted"
                                class="w-full rounded-lg border-0 bg-gray-50 px-4 py-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-500 focus:ring-2 focus:ring-inset focus:ring-primary-500 sm:text-sm sm:leading-6"
                            >
                            <button
                                type="submit"
                                :disabled="loading || submitted"
                                class="whitespace-nowrap rounded-lg bg-primary-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-primary-500/25 hover:bg-primary-600 transition-all disabled:opacity-60"
                            >
                                {{ submitted ? t('landing.waitingList.submittedButton') : t('landing.finalCta.cta') }}
                            </button>
                        </form>
                    </ClientOnly>
                </div>
            </div>
        </section>

    </div>
</template>

<style scoped>
.wl-hp {
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
