import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const stories = [
  "components-button--primary",
  "components-button--variants",
  "components-button--disabled",
  "components-textfield--default",
  "components-textfield--invalid",
  "components-textfield--text-area",
  "components-checkbox--default",
  "components-checkbox--selected",
  "components-postcard--published",
  "components-postcard--long-title",
  "components-markdowncontent--article",
  "components-formerrorsummary--errors",
];

for (const storyId of stories) {
  test(`accessibility: ${storyId}`, async ({ page }) => {
    await page.goto(`/iframe.html?id=${storyId}&viewMode=story`);
    await page.locator("#storybook-root").waitFor();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(
      results.violations,
      JSON.stringify(results.violations, null, 2),
    ).toEqual([]);
  });
}
