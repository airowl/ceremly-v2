import { beforeAll, afterAll, vi } from "vitest";
import { ConvexTest } from "convex-test";

let test: ConvexTest;

beforeAll(() => {
  test = new ConvexTest(require("./schema"));
});

afterAll(() => {
  test.teardown();
});

globalThis.__CONVEX_TEST__ = test;