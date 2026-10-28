import { expect, test } from "@playwright/test";

const stories = [
  { id: "components-button--primary", name: "button-primary" },
  { id: "components-button--variants", name: "button-variants" },
  { id: "components-button--disabled", name: "button-disabled" },
  { id: "components-textfield--default", name: "text-field-default" },
  { id: "components-textfield--invalid", name: "text-field-invalid" },
  { id: "components-textfield--text-area", name: "text-field-text-area" },
  { id: "components-checkbox--default", name: "checkbox-default" },
  { id: "components-checkbox--selected", name: "checkbox-selected" },
  { id: "components-postcard--published", name: "post-card-published" },
  { id: "components-postcard--long-title", name: "post-card-long-title" },
  { id: "components-markdowncontent--article", name: "markdown-content-article" },
  { id: "components-formerrorsummary--errors", name: "form-error-summary-errors" },
];

for (const story of stories) {
  test(`visual regression: ${story.id}`, async ({ page }) => {
    await page.goto(`/iframe.html?id=${story.id}&viewMode=story`);
    await page.locator("#storybook-root").waitFor();
    await expect(page.locator("#storybook-root")).toHaveScreenshot(
      `${story.name}.png`,
      {
        maxDiffPixelRatio: 0.02,
      },
    );
  });
}
