export default defineAppConfig({
    ui: {
        // ── Semantic Color Mapping ──
        // Maps DaisyUI-style warm palette to Nuxt UI semantic colors
        colors: {
            primary: "primary",
            secondary: "secondary",
            neutral: "stone",
            success: "emerald",
            info: "sky",
            warning: "amber",
            error: "rose",
        },

        // ── Button ──
        // DaisyUI: press animation, pointer cursor, smooth transitions
        button: {
            slots: {
                base: "transition duration-200 active:scale-[0.97] cursor-pointer",
            },
        },

        // ── Card ──
        // DaisyUI: subtle elevation with soft shadow
        card: {
            slots: {
                root: "shadow-sm",
            },
        },

        // ── Badge ──
        // DaisyUI: pill-shaped badges (rounded-full)
        badge: {
            slots: {
                base: "rounded-full",
            },
        },

        // ── Modal ──
        // DaisyUI: frosted backdrop, elevated content panel
        modal: {
            slots: {
                overlay: "backdrop-blur-sm",
                content: "rounded-xl shadow-xl",
            },
        },

        // ── Alert ──
        // DaisyUI: elevated alert with soft shadow
        alert: {
            slots: {
                root: "shadow-sm",
            },
        },

        // ── Input ──
        // DaisyUI: smooth focus/ring transition
        input: {
            slots: {
                base: "transition duration-200",
            },
        },

        // ── Textarea ──
        // DaisyUI: smooth focus/ring transition
        textarea: {
            slots: {
                base: "transition duration-200",
            },
        },

        // ── Select ──
        // DaisyUI: rounded dropdown panel
        select: {
            slots: {
                content: "rounded-lg",
            },
        },

        // ── Dropdown Menu ──
        // DaisyUI: rounded dropdown with elevation
        dropdownMenu: {
            slots: {
                content: "rounded-lg",
            },
        },

        // ── Tooltip ──
        // DaisyUI: elevated tooltip
        tooltip: {
            slots: {
                content: "shadow-md",
            },
        },

        // ── Table ──
        // DaisyUI: rounded container
        table: {
            slots: {
                root: "rounded-lg",
            },
        },

        // ── Accordion ──
        // DaisyUI: smooth hover/focus transitions
        accordion: {
            slots: {
                trigger: "transition-colors duration-200",
            },
        },

        // ── Tabs ──
        // DaisyUI: rounded tab container
        tabs: {
            slots: {
                list: "rounded-lg",
            },
        },

        // ── Checkbox ──
        // DaisyUI: slightly rounded checkbox
        checkbox: {
            slots: {
                base: "rounded",
            },
        },
    },
});
