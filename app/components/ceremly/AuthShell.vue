<script setup lang="ts">
// Port of AuthShell (docs/ui/project/screens/auth.jsx): split layout with
// editorial ink panel on the left (decorative circles, brand, serif title,
// quote card) and form column on the right (max-width 420).
// Below 900px the left panel is hidden and the form is centered.
export interface AuthShellQuote {
    text: string;
    av?: string;
    who?: string;
    where?: string;
}

defineProps<{
    label: string;
    body: string;
    quote?: AuthShellQuote;
    foot: string;
}>();
</script>

<template>
    <div class="cer auth-shell">
        <!-- EDITORIAL PANEL -->
        <div class="auth-side">
            <!-- decoration -->
            <div
                style="position: absolute; right: -110px; top: -90px; width: 320px; height: 320px; border-radius: 50%; background: var(--purple-bright); opacity: 0.7;"
            />
            <div
                style="position: absolute; right: 90px; bottom: -60px; width: 150px; height: 150px; border-radius: 50%; background: var(--orange); opacity: 0.9;"
            />
            <div class="row" style="gap: 7px; position: relative;">
                <span class="serif" style="font-size: 30px; font-weight: 800; letter-spacing: -0.03em;">Ceremly</span>
                <span style="width: 7px; height: 7px; border-radius: 50%; background: var(--orange); display: inline-block;" />
            </div>

            <div style="position: relative;">
                <div class="mono" style="font-size: 12px; letter-spacing: 0.1em; color: var(--blue-soft); text-transform: uppercase;">
                    {{ label }}
                </div>
                <div class="serif" style="font-size: 58px; font-weight: 800; line-height: 0.98; margin-top: 16px; letter-spacing: -0.04em;">
                    <slot name="title" />
                </div>
                <p style="font-size: 16px; color: rgba(255, 255, 255, 0.88); line-height: 1.6; margin-top: 18px; max-width: 380px;">
                    {{ body }}
                </p>

                <div
                    v-if="quote"
                    style="margin-top: 40px; padding: 20px 22px; background: rgba(255, 255, 255, 0.1); border-radius: 14px; border: 2px solid var(--ink); max-width: 380px;"
                >
                    <p class="serif" style="font-size: 19px; font-weight: 600; line-height: 1.35; margin: 0; letter-spacing: -0.01em;">
                        {{ quote.text }}
                    </p>
                    <div v-if="quote.who" class="row" style="gap: 10px; margin-top: 14px;">
                        <div class="av lg" style="background: var(--orange); color: var(--ink); border-color: var(--ink);">{{ quote.av }}</div>
                        <div class="col">
                            <span style="font-size: 13px; font-weight: 600;">{{ quote.who }}</span>
                            <span class="small" style="color: rgba(255, 255, 255, 0.7);">{{ quote.where }}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="mono" style="font-size: 12px; color: rgba(255, 255, 255, 0.65); letter-spacing: 0.06em; position: relative;">
                v0.1 · {{ foot }}
            </div>
        </div>

        <!-- FORM COLUMN -->
        <div class="auth-form-wrap">
            <div style="width: 100%; max-width: 420px;">
                <slot />
            </div>
        </div>
    </div>
</template>

<style scoped>
.auth-shell {
    min-height: 100vh;
    min-height: 100dvh;
    display: grid;
    grid-template-columns: 1fr 1.1fr;
    background: var(--bone);
}
.auth-side {
    background: var(--ink);
    color: #fff;
    padding: 48px 56px;
    border-right: 2px solid var(--ink);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    position: relative;
    overflow: hidden;
}
.auth-form-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 48px;
}

@media (max-width: 900px) {
    .auth-shell {
        grid-template-columns: 1fr;
    }
    .auth-side {
        display: none;
    }
    .auth-form-wrap {
        padding: 32px 20px;
    }
}
</style>
