/**
 * Landing Page Theme System
 *
 * Provides component-level style overrides for the landing page.
 * Use with the `ui` prop on any Nuxt UI component:
 *
 * ```vue
 * const landing = useLandingTheme()
 * <UButton :ui="landing.button" />
 * <UCard :ui="landing.card" />
 * ```
 *
 * Design tokens (colors, radius, backgrounds, borders) are controlled
 * via the `.landing-page` CSS scope in main.css.
 *
 * Component-level overrides (slots, variants) are controlled here.
 * Uncomment and customize any section as needed.
 */
export function useLandingTheme() {
    return {
        // ── Interactive ──

        button: {
            // slots: {
            //     base: '',
            //     label: '',
            //     leadingIcon: '',
            //     trailingIcon: '',
            // },
            // defaultVariants: {
            //     color: 'primary',
            //     variant: 'solid',
            //     size: 'md',
            // },
        },

        // ── Content ──

        card: {
            // slots: {
            //     root: '',
            //     header: '',
            //     body: '',
            //     footer: '',
            // },
            // defaultVariants: {
            //     variant: 'outline',
            // },
        },

        badge: {
            // slots: {
            //     base: '',
            //     label: '',
            //     leadingIcon: '',
            //     trailingIcon: '',
            // },
            // defaultVariants: {
            //     color: 'primary',
            //     variant: 'solid',
            //     size: 'md',
            // },
        },

        // ── Page Layout ──

        pageHero: {
            // slots: { root: '', container: '' },
        },

        pageSection: {
            // slots: { root: '', container: '' },
        },

        pageCard: {
            // slots: { root: '' },
        },

        pageGrid: {
            // slots: { root: '' },
        },

        // ── Forms ──

        input: {
            // slots: {
            //     root: '',
            //     base: '',
            //     leading: '',
            //     leadingIcon: '',
            //     trailing: '',
            //     trailingIcon: '',
            // },
            // defaultVariants: {
            //     size: 'md',
            //     color: 'primary',
            //     variant: 'outline',
            // },
        },

        textarea: {
            // slots: {
            //     root: '',
            //     base: '',
            // },
            // defaultVariants: {
            //     size: 'md',
            //     color: 'primary',
            //     variant: 'outline',
            // },
        },

        formField: {
            // slots: { root: '', label: '', description: '', error: '' },
        },

        // ── Navigation ──

        accordion: {
            // slots: {
            //     root: '',
            //     item: '',
            //     trigger: '',
            //     content: '',
            //     body: '',
            //     leadingIcon: '',
            //     trailingIcon: '',
            //     label: '',
            // },
        },

        tabs: {
            // slots: {
            //     root: '',
            //     list: '',
            //     indicator: '',
            //     trigger: '',
            //     label: '',
            //     content: '',
            // },
        },

        // ── Layout ──

        header: {
            // slots: { root: '' },
        },

        footer: {
            // slots: { root: '' },
        },

        separator: {
            // slots: { root: '' },
        },

        // ── Feedback ──

        alert: {
            // slots: {
            //     root: '',
            //     wrapper: '',
            //     title: '',
            //     description: '',
            //     icon: '',
            //     actions: '',
            //     close: '',
            // },
            // defaultVariants: {
            //     color: 'primary',
            //     variant: 'solid',
            // },
        },

        tooltip: {
            // slots: {
            //     content: '',
            //     text: '',
            // },
        },
    }
}
