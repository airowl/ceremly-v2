import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  migrationHealth: defineTable({
    key: v.string(),
    value: v.string(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
});