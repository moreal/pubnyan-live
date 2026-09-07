import type { StorybookConfig } from '@storybook/html-vite';

const config: StorybookConfig = {
  framework: '@storybook/html-vite',
  stories: ['../stories/**/*.stories.ts'],
  staticDirs: ['../dist'],
  viteFinal: async (viteConfig) => {
    viteConfig.base = process.env.STORYBOOK_BASE ?? '/';
    return viteConfig;
  },
};

export default config;
