import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

type StoryEntry = {
  id: string;
  viewport?: { width: number; height: number };
};

const stories: StoryEntry[] = [
  { id: "components-button--primary" },
  { id: "components-button--variants" },
  { id: "components-button--disabled" },
  { id: "components-textfield--default" },
  { id: "components-textfield--invalid" },
  { id: "components-textfield--text-area" },
  { id: "components-checkbox--default" },
  { id: "components-checkbox--selected" },
  { id: "components-postcard--published" },
  { id: "components-postcard--long-title" },
  { id: "components-markdowncontent--article" },
  { id: "components-formerrorsummary--errors" },
  { id: "components-markdowneditor--wide-screen" },
  { id: "components-markdowneditor--narrow-screen", viewport: { width: 480, height: 900 } },
  { id: "components-markdowneditor--long-body" },
  { id: "components-markdowneditor--empty-preview" },
];

for (const story of stories) {
  test(`accessibility: ${story.id}`, async ({ page }) => {
    if (story.viewport) {
      await page.setViewportSize(story.viewport);
    }
    await page.goto(`/iframe.html?id=${story.id}&viewMode=story`);
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
