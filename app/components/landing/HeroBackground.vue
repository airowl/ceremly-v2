<script setup lang="ts">
const { isLoading } = useLoadingIndicator()

const appear = ref(false)
const appeared = ref(false)
const animateGradient = ref(false)

onMounted(() => {
    setTimeout(() => {
        appear.value = true
        setTimeout(() => {
            appeared.value = true
            animateGradient.value = true
        }, 1000)
    }, 0)
})
</script>

<template>
    <div class="absolute w-full -top-px transition-all text-primary shrink-0" :class="[
        isLoading ? 'animate-pulse' : (appear ? '' : 'opacity-0'),
        appeared ? 'duration-400' : 'duration-1000'
    ]">
        <svg viewBox="0 0 1440 181" fill="none" xmlns="http://www.w3.org/2000/svg" class="pointer-events-none relative">
            <mask id="path-1-inside-1_414_5526" fill="white">
                <path d="M0 0H1440V181H0V0Z" />
            </mask>
            <path
                d="M0 0H1440V181H0V0Z"
                fill="url(#paint0_linear_414_5526)"
                fill-opacity="0.22"
                class="transition-all duration-1000"
                :class="animateGradient ? 'animate-gradient-flow' : ''"
            />
            <path
                d="M0 2H1440V-2H0V2Z"
                fill="url(#paint1_linear_414_5526)"
                mask="url(#path-1-inside-1_414_5526)"
                class="transition-all duration-700"
            />
            <defs>
                <linearGradient id="paint0_linear_414_5526" x1="720" y1="0" x2="720" y2="181"
                    gradientUnits="userSpaceOnUse">
                    <stop stop-color="currentColor">
                        <animate
                            attributeName="stop-opacity"
                            values="1;0.8;1"
                            dur="3s"
                            repeatCount="indefinite"
                        />
                    </stop>
                    <stop offset="1" stop-color="currentColor" stop-opacity="0" />
                </linearGradient>
                <linearGradient id="paint1_linear_414_5526" x1="0" y1="90.5" x2="1440" y2="90.5"
                    gradientUnits="userSpaceOnUse">
                    <stop stop-color="currentColor" stop-opacity="0" />
                    <stop offset="0.395" stop-color="currentColor">
                        <animate
                            attributeName="stop-opacity"
                            values="1;0.7;1"
                            dur="4s"
                            repeatCount="indefinite"
                        />
                    </stop>
                    <stop offset="1" stop-color="currentColor" stop-opacity="0" />
                </linearGradient>
            </defs>
        </svg>

        <!-- Particelle decorative animate -->
        <div class="absolute inset-0 overflow-hidden pointer-events-none">
            <div
                v-for="i in 6"
                :key="i"
                class="absolute w-1 h-1 bg-primary/30 rounded-full animate-float"
                :style="{
                    left: `${(i * 15) + 5}%`,
                    top: `${20 + (i * 10)}px`,
                    animationDelay: `${i * 0.7}s`,
                    animationDuration: `${3 + (i * 0.5)}s`
                }"
            />
        </div>
    </div>
</template>

<style scoped>
@keyframes gradient-flow {
    0%, 100% {
        transform: translateY(0px);
    }
    50% {
        transform: translateY(-5px);
    }
}

@keyframes float {
    0%, 100% {
        transform: translateY(0px) translateX(0px);
        opacity: 0;
    }
    10% {
        opacity: 0.6;
    }
    50% {
        transform: translateY(-40px) translateX(10px);
        opacity: 0.3;
    }
    90% {
        opacity: 0.1;
    }
    100% {
        transform: translateY(-80px) translateX(-10px);
        opacity: 0;
    }
}

.animate-gradient-flow {
    animation: gradient-flow 4s ease-in-out infinite;
}

.animate-float {
    animation: float linear infinite;
}
</style>
