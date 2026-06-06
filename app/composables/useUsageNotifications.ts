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
            // Check organization limits
            const orgLimit = await userStore.checkOrgCreationLimit();

            if (!orgLimit.allowed) {
                addNotification({
                    type: 'error',
                    title: 'Organization Limit Reached',
                    message: `You have reached the maximum of ${orgLimit.limit} organizations. Upgrade to create more.`,
                    actionUrl: '/dashboard/subscription',
                    actionText: 'Upgrade Plan'
                });
            } else if (orgLimit.current >= orgLimit.limit * 0.8) {
                addNotification({
                    type: 'warning',
                    title: 'Organization Limit Near',
                    message: `You have used ${orgLimit.current} of ${orgLimit.limit} available organizations.`,
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
