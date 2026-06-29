<script setup lang="ts">
// Per-event paywall: intercepts the 402 (Free plan limit) and offers the
// Celebration unlock (€39 one-time). The unlock creates a Creem checkout
// server-side and redirects — see useSubscription().unlockEvent.
import CerIcon from "~/components/ceremly/CerIcon.vue";
import { CELEBRATION_PRICE_CENTS } from "~~/shared/constants/pricing";

const props = defineProps<{
    /** Opening controlled by the parent (v-model:open). */
    open: boolean;
    /** Event to unlock. */
    eventId: string;
    /** Message from the 402. */
    reason?: string;
}>();

const emit = defineEmits<{ "update:open": [value: boolean]; close: [] }>();

const { t } = useI18n();
const toast = useToast();
const { unlockEvent } = useSubscription();

const loading = ref(false);
const priceLabel = computed(() => `€${(CELEBRATION_PRICE_CENTS / 100).toFixed(0)}`);
const features = computed<string[]>(() => [
    t("ceremly.paywall.feat1"), t("ceremly.paywall.feat2"),
    t("ceremly.paywall.feat3"), t("ceremly.paywall.feat4"),
]);

function onClose() { emit("update:open", false); emit("close"); }

async function onUnlock() {
    loading.value = true;
    try {
        // unlockEvent redirects to the Creem checkout: on success the
        // page changes and this code does not continue.
        await unlockEvent(props.eventId);
    } catch {
        loading.value = false;
        toast.add({ title: t("ceremly.paywall.errorTitle"), description: t("ceremly.paywall.errorDesc"), color: "error" });
    }
}
</script>

<template>
    <UModal :open="open" @update:open="(v: boolean) => !v && onClose()">
        <template #content>
            <div class="cer-paywall">
                <div class="cer-paywall-head">
                    <span class="cer-paywall-icon"><CerIcon name="sparkle" :s="22" /></span>
                    <button type="button" class="cer-paywall-x" :aria-label="t('common.close')" @click="onClose"><CerIcon name="x" :s="18" /></button>
                </div>
                <h2 class="cer-paywall-title serif">{{ t("ceremly.paywall.title") }}</h2>
                <p v-if="reason" class="cer-paywall-reason">{{ reason }}</p>
                <p class="cer-paywall-sub">{{ t("ceremly.paywall.subtitle") }}</p>
                <div class="cer-paywall-price">
                    <span class="cer-paywall-amount serif">{{ priceLabel }}</span>
                    <span class="cer-paywall-once">{{ t("ceremly.paywall.once") }}</span>
                </div>
                <ul class="cer-paywall-feats">
                    <li v-for="f in features" :key="f"><span class="cer-paywall-check"><CerIcon name="check" :s="15" /></span>{{ f }}</li>
                </ul>
                <button type="button" class="cer-btn dark cer-paywall-cta" :disabled="loading" @click="onUnlock">
                    {{ loading ? t("ceremly.paywall.loading") : t("ceremly.paywall.cta", { price: priceLabel }) }}
                    <CerIcon v-if="!loading" name="chevR" :s="14" />
                </button>
                <button type="button" class="cer-paywall-later" @click="onClose">{{ t("ceremly.paywall.later") }}</button>
            </div>
        </template>
    </UModal>
</template>

<style scoped>
.cer-paywall { padding: 28px; text-align: center; }
.cer-paywall-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.cer-paywall-icon { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 12px; background: var(--orange); color: var(--ink); border: 2px solid var(--ink); }
.cer-paywall-x { background: none; border: none; cursor: pointer; color: var(--ink-500); padding: 4px; }
.cer-paywall-title { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; margin: 8px 0 6px; }
.cer-paywall-reason { font-size: 13px; color: var(--ink-700); background: var(--bone-50); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; margin: 0 0 12px; }
.cer-paywall-sub { font-size: 14px; color: var(--ink-700); line-height: 1.55; margin: 0 0 18px; }
.cer-paywall-price { display: flex; align-items: baseline; justify-content: center; gap: 8px; margin-bottom: 18px; }
.cer-paywall-amount { font-size: 52px; font-weight: 800; line-height: 1; letter-spacing: -0.03em; }
.cer-paywall-once { font-size: 13px; color: var(--ink-500); }
.cer-paywall-feats { list-style: none; padding: 0; margin: 0 0 22px; display: flex; flex-direction: column; gap: 10px; text-align: left; }
.cer-paywall-feats li { display: flex; align-items: center; gap: 10px; font-size: 14px; color: var(--ink-700); }
.cer-paywall-check { color: var(--purple); flex-shrink: 0; }
.cer-paywall-cta { width: 100%; justify-content: center; padding: 14px 16px; }
.cer-paywall-later { background: none; border: none; cursor: pointer; color: var(--ink-500); font-size: 13px; margin-top: 12px; text-decoration: underline; }
</style>
