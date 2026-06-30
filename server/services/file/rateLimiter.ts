import { cacheClient } from "~~/server/utils/drivers";

export class UploadRateLimiter {
    private windowSizeMinutes: number;
    private maxUploadsPerWindow: number;

    constructor(windowSizeMinutes: number, maxUploadsPerWindow: number) {
        this.windowSizeMinutes = windowSizeMinutes;
        this.maxUploadsPerWindow = maxUploadsPerWindow;
    }

    private getBucketKey(userId: string): string {
        const now = Date.now();
        const bucketTimestamp = Math.floor(
            now / (this.windowSizeMinutes * 60 * 1000),
        );
        return `upload_rate_limit:${userId}:${bucketTimestamp}`;
    }

    async checkAndIncrement(
        userId: string,
        incrementBy: number = 1,
    ): Promise<{ allowed: boolean; currentCount: number }> {
        const bucketKey = this.getBucketKey(userId);
        const ttlSeconds = this.windowSizeMinutes * 60;

        // ATOMIC increment-then-check (Upstash INCRBY): the previous get+set was a
        // TOCTOU race — concurrent serverless invocations all read the same count,
        // each passed the check and each wrote count+1, silently exceeding the cap.
        // Reserving the slot first guarantees the cap holds under concurrency. A
        // request that lands over the limit still consumes its slot (standard
        // fixed-window-counter behaviour); real usage is incrementBy=1.
        const newCount = await cacheClient.increment(bucketKey, ttlSeconds, incrementBy);
        if (newCount > this.maxUploadsPerWindow) {
            return { allowed: false, currentCount: newCount };
        }
        return { allowed: true, currentCount: newCount };
    }

    async getCurrentCount(userId: string): Promise<number> {
        const bucketKey = this.getBucketKey(userId);
        const currentValue = await cacheClient.get(bucketKey);
        return currentValue ? Number.parseInt(currentValue, 10) : 0;
    }
}
