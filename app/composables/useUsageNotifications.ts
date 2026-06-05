/**
 * Composable for managing usage limit notifications
 */
interface UsageNotification {
    id: string;
    title: string;
    message: string;
    type: 'warning' | 'error';
    actionUrl?: string;
    actionText?: string;
}

export function useUsageNotifications() {
    const notifications = useState<UsageNotification[]>('usage:notifications', () => []);
    const dismissedIds = useState<Set<string>>('usage:dismissed', () => new Set());

    const warningNotifications = computed(() =>
        notifications.value.filter(n => n.type === 'warning' && !dismissedIds.value.has(n.id))
    );

    const errorNotifications = computed(() =>
        notifications.value.filter(n => n.type === 'error' && !dismissedIds.value.has(n.id))
    );

    function dismissNotification(id: string) {
        dismissedIds.value = new Set([...dismissedIds.value, id]);
    }

    function addNotification(notification: Omit<UsageNotification, 'id'>) {
        const id = `${notification.type}-${Date.now()}`;
        notifications.value = [...notifications.value, { ...notification, id }];
    }

    function clearNotifications() {
        notifications.value = [];
        dismissedIds.value = new Set();
    }

    /**
     * Check usage limits and create notifications if needed
     */
    async function checkUsageLimits(_eventId?: string) {
        if (import.meta.server) return;

        const userStore = useUserStore();
        const user = userStore.user;
        if (!user?.id) return;

        try {
            // Check event limits
            const eventLimit = await userStore.checkEventCreationLimit();

            if (!eventLimit.allowed) {
                addNotification({
                    type: 'error',
                    title: 'Event Limit Reached',
                    message: `You have reached the maximum of ${eventLimit.limit} events. Upgrade to create more.`,
                    actionUrl: '/dashboard/subscription',
                    actionText: 'Upgrade Plan'
                });
            } else if (eventLimit.current >= eventLimit.limit * 0.8) {
                addNotification({
                    type: 'warning',
                    title: 'Event Limit Near',
                    message: `You have used ${eventLimit.current} of ${eventLimit.limit} available events.`,
                    actionUrl: '/dashboard/subscription',
                    actionText: 'View Plans'
                });
            }
        } catch (error) {
            console.warn('Error checking usage limits:', error);
        }
    }

    return {
        notifications: readonly(notifications),
        warningNotifications,
        errorNotifications,
        dismissNotification,
        addNotification,
        clearNotifications,
        checkUsageLimits
    };
}
