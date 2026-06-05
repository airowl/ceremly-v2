/**
 * Middleware per controllare i requisiti del piano di sottoscrizione
 *
 * Utilizzo:
 * Nelle pagine che richiedono un piano specifico, aggiungere nel definePageMeta:
 *
 * definePageMeta({
 *   middleware: 'plan-required',
 *   requiredPlan: 'pro' // o 'basic', 'enterprise', etc.
 * })
 *
 * Piani disponibili (in ordine gerarchico):
 * - free: 0 (nessuna restrizione)
 * - basic: 1
 * - pro: 2
 * - enterprise: 3
 *
 * Se l'utente non ha il piano richiesto, viene reindirizzato a /upgrade
 * Se non è autenticato, viene reindirizzato a /login
 */
export default defineNuxtRouteMiddleware(async (to, from) => {
    const userStore = useUserStore();
    const user = userStore.getUser;

    // Reindirizza al login se l'utente non è autenticato
    if (!user) {
        return navigateTo("/login");
    }

    const requiredPlan = to.meta.requiredPlan as string;

    // Se non è specificato un piano richiesto, permetti l'accesso
    if (!requiredPlan) {
        return;
    }

    // Assicurati che la subscription sia caricata
    let subscription = userStore.getSubscription;
    if (!subscription) {
        try {
            subscription = await userStore.fetchSubscription();
        } catch (error) {
            console.error("Errore nel recupero della subscription:", error);
            return navigateTo("/login");
        }
    }

    // Ottieni il piano dell'utente (default: free)
    const userPlan = subscription?.plan || "free";

    // Gerarchia dei piani (valori più alti = piani superiori)
    const planHierarchy: Record<string, number> = {
        free: 0,
        basic: 1,
        pro: 2,
        enterprise: 3,
    };

    // Verifica se l'utente ha il piano richiesto
    const userPlanLevel = planHierarchy[userPlan] ?? 0;
    const requiredPlanLevel = planHierarchy[requiredPlan] ?? 0;

    if (userPlanLevel < requiredPlanLevel) {
        return navigateTo("/upgrade");
    }
});
