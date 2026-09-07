// These files come from `npm run export:video` and need `ffmpeg` on PATH.
import type { Meta, StoryObj } from '@storybook/html-vite';
import { clips } from '#motion/index.ts';

const clipNames = clips.map((clip) => clip.name);
const formats = ['mp4', 'webp', 'gif'] as const;

interface PlayerArgs {
  clip: string;
  format: (typeof formats)[number];
}

const meta: Meta<PlayerArgs> = {
  title: 'Targets/Video',
  argTypes: {
    clip: {
      control: { type: 'select' },
      options: clipNames,
    },
    format: {
      control: { type: 'select' },
      options: formats,
    },
  },
  args: {
    clip: clipNames[0],
    format: 'mp4',
  },
};

export default meta;

type Story = StoryObj<PlayerArgs>;

export const Player: Story = {
  render: (args) => {
    const src = `/video/${args.clip}.${args.format}`;
    if (args.format === 'mp4') {
      const video = document.createElement('video');
      video.src = src;
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.controls = true;
      video.style.width = '256px';
      video.style.height = '256px';
      return video;
    }
    const img = document.createElement('img');
    img.src = src;
    img.alt = `${args.clip} (${args.format})`;
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

      const video = document.createElement('video');
      video.src = `/video/${name}.mp4`;
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.controls = true;
      video.style.width = '128px';
      video.style.height = '128px';

      const caption = document.createElement('figcaption');
      caption.textContent = name;

      cell.append(video, caption);
      grid.append(cell);
    }

    return grid;
  },
};
