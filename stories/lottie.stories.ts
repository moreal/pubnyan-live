import type { Meta, StoryObj } from '@storybook/html-vite';
import { DotLottie } from '@lottiefiles/dotlottie-web';
import lottie from 'lottie-web';
import { clips } from '#motion/index.ts';

const clipNames = clips.map((clip) => clip.name);

interface PlayerArgs {
  clip: string;
  speed: number;
  loop: boolean;
}

const meta: Meta<PlayerArgs> = {
  title: 'Targets/Lottie',
  argTypes: {
    clip: {
      control: { type: 'select' },
      options: clipNames,
    },
    speed: {
      control: { type: 'number' },
    },
    loop: {
      control: { type: 'boolean' },
    },
  },
  args: {
    clip: clipNames[0],
    speed: 1,
    loop: true,
  },
};

export default meta;

type Story = StoryObj<PlayerArgs>;

export const Player: Story = {
  render: (args) => {
    const container = document.createElement('div');
    container.style.width = '256px';
    container.style.height = '256px';

    const instance = lottie.loadAnimation({
      container,
      path: `/lottie/${args.clip}.json`,
      renderer: 'svg',
      loop: args.loop,
      autoplay: true,
    });
    instance.setSpeed(args.speed);

    container.addEventListener('DOMNodeRemovedFromDocument', () => instance.destroy());

    const observer = new MutationObserver(() => {
      if (!container.isConnected) {
        instance.destroy();
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return container;
  },
};

export const Bundle: Story = {
  render: () => {
    const wrapper = document.createElement('div');

    const select = document.createElement('select');
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    canvas.style.width = '256px';
    canvas.style.height = '256px';

    const caption = document.createElement('figcaption');
    caption.textContent = 'loading…';

    wrapper.append(select, canvas, caption);

    const dotlottie = new DotLottie({
      canvas,
      src: '/lottie/pubnyan.lottie',
      autoplay: true,
      loop: true,
    });

    dotlottie.addEventListener('load', () => {
      const animations = dotlottie.manifest?.animations ?? [];
      select.replaceChildren(
        ...animations.map(({ id }) => {
          const option = document.createElement('option');
          option.value = id;
          option.textContent = id;
          return option;
        }),
      );
      caption.textContent = `animations: ${animations.map(({ id }) => id).join(', ')}`;
    });

    select.addEventListener('change', () => {
      dotlottie.loadAnimation(select.value);
    });

    return wrapper;
  },
};
