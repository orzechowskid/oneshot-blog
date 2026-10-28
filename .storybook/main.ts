import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../app/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-a11y", "@storybook/addon-docs"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  docs: {
    autodocs: "tag",
  },
  async viteFinal(config) {
    const stripReactRouter = (
      plugins: NonNullable<typeof config.plugins>,
    ): NonNullable<typeof config.plugins> => {
      return plugins.flatMap((plugin) => {
        if (Array.isArray(plugin)) return stripReactRouter(plugin);
        if (
          plugin &&
          typeof plugin === "object" &&
          "name" in plugin &&
          typeof plugin.name === "string" &&
          plugin.name.startsWith("react-router")
        ) {
          return [];
        }
        return [plugin];
      });
    };

    config.plugins = stripReactRouter(config.plugins ?? []);
    return config;
  },
};

export default config;
