import { defineApp } from "convex/server";
import betterAuth from "@convex-dev/better-auth/convex.config";
import creem from "@creem_io/convex/convex.config";

// Task 4 (migration): Better Auth owns identity, Creem owns billing state.
// Both are installed as Convex components so the app's own schema stays the
// application domain only.
const app = defineApp();
app.use(betterAuth);
app.use(creem);
export default app;
