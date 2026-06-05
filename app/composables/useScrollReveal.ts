export function useScrollReveal() {
    let observer: IntersectionObserver | null = null

    onMounted(() => {
        nextTick(() => {
            const elements = document.querySelectorAll('.reveal, .reveal-stagger')
            if (!elements.length) return

            observer = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting) {
                            entry.target.classList.add('is-visible')
                            observer?.unobserve(entry.target)
                        }
                    })
                },
                {
                    threshold: 0.1,
                    rootMargin: '0px 0px -60px 0px',
                },
            )

            elements.forEach((el) => observer!.observe(el))
        })
    })

    onUnmounted(() => {
        observer?.disconnect()
    })
}
