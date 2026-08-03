import { expect, test as base } from "@playwright/test";
import { MockApi } from "./mock-api";

type BrowserFixtures = {
  mockApi: MockApi;
};

export const test = base.extend<BrowserFixtures>({
  mockApi: [
    async ({ page }, use) => {
      const api = new MockApi();
      await api.install(page);
      await use(api);
      expect(api.unexpectedRequests, "every API request uses a local fixture").toEqual([]);
    },
    { auto: true }
  ]
});

export { expect } from "@playwright/test";
