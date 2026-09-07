import type { Meta, StoryObj } from '@storybook/html-vite';
import { clips } from '#motion/index.ts';
import { assetPath } from './asset-path.ts';

const clipNames = clips.map((clip) => clip.name);

interface PlayerArgs {
  clip: string;
}

const meta: Meta<PlayerArgs> = {
  title: 'Targets/SVG',
  argTypes: {
    clip: {
      control: { type: 'select' },
      options: clipNames,
    },
  },
  args: {
    clip: clipNames[0],
  },
};

export default meta;

type Story = StoryObj<PlayerArgs>;

export const Player: Story = {
  render: (args) => {
    const img = document.createElement('img');
    img.src = assetPath(`svg/${args.clip}.svg`);
    img.alt = args.clip;
    img.style.width = '256px';
    img.style.height = '256px';
    return img;
  },
};

export const Gallery: Story = {
  render: () => {
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(160px, 1fr))';
    grid.style.gap = '16px';

    for (const name of clipNames) {
      const cell = document.createElement('figure');
      cell.style.margin = '0';
      cell.style.textAlign = 'center';

      const img = document.createElement('img');
      img.src = assetPath(`svg/${name}.svg`);
      img.alt = name;
      img.style.width = '128px';
      img.style.height = '128px';

      const caption = document.createElement('figcaption');
      caption.textContent = name;

      cell.append(img, caption);
      grid.append(cell);
    }

    return grid;
  },
};
