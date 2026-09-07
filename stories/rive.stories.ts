import type { Meta, StoryObj } from '@storybook/html-vite';
import { Rive } from '@rive-app/canvas';
import { clips, getRig, machine } from '#motion/index.ts';
import { assetPath } from './asset-path.ts';

const clipNames = clips.map((clip) => clip.name);
const clipByName = new Map(clips.map((clip) => [clip.name, clip]));

interface PlayerArgs {
  clip: string;
}

const meta: Meta = {
  title: 'Targets/Rive',
};

export default meta;

type PlayerStory = StoryObj<PlayerArgs>;

export const Player: PlayerStory = {
  argTypes: {
    clip: {
      control: { type: 'select' },
      options: clipNames,
    },
  },
  args: {
    clip: clipNames[0],
  },
  render: (args) => {
    const clip = clipByName.get(args.clip)!;
    const rig = getRig(clip.rig);

    const canvas = document.createElement('canvas');
    canvas.width = rig.artboard.width;
    canvas.height = rig.artboard.height;
    canvas.style.width = `${rig.artboard.width}px`;
    canvas.style.height = `${rig.artboard.height}px`;

    const instance = new Rive({
      canvas,
      src: assetPath(`rive/${args.clip}.riv`),
      autoplay: true,
    });

    const observer = new MutationObserver(() => {
      if (!canvas.isConnected) {
        instance.cleanup();
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return canvas;
  },
};

const machineRig = getRig(machine.rig);
const expressionInput = machine.inputs.expression as { type: 'enum'; values: string[]; default: string };
const loadingInput = machine.inputs.loading as { type: 'bool'; default: boolean };
const triggerNames = Object.entries(machine.inputs)
  .filter(([, input]) => input.type === 'trigger')
  .map(([name]) => name);

export const Machine: StoryObj = {
  render: () => {
    const wrapper = document.createElement('div');

    const toolbar = document.createElement('div');
    toolbar.style.display = 'flex';
    toolbar.style.flexWrap = 'wrap';
    toolbar.style.gap = '8px';
    toolbar.style.marginBottom = '8px';

    const expressionSelect = document.createElement('select');
    for (const value of expressionInput.values) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      expressionSelect.append(option);
    }
    expressionSelect.value = expressionInput.default;

    const loadingLabel = document.createElement('label');
    const loadingCheckbox = document.createElement('input');
    loadingCheckbox.type = 'checkbox';
    loadingCheckbox.checked = loadingInput.default;
    loadingLabel.append(loadingCheckbox, ' loading');

    const triggerButtons = triggerNames.map((name) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = name;
      return button;
    });

    toolbar.append(expressionSelect, loadingLabel, ...triggerButtons);

    const canvas = document.createElement('canvas');
    canvas.width = machineRig.artboard.width;
    canvas.height = machineRig.artboard.height;
    canvas.style.width = `${machineRig.artboard.width}px`;
    canvas.style.height = `${machineRig.artboard.height}px`;

    const inputsCaption = document.createElement('figcaption');
    inputsCaption.textContent = 'loading…';

    wrapper.append(toolbar, canvas, inputsCaption);

    const instance = new Rive({
      canvas,
      src: assetPath('rive/pubnyan.riv'),
      stateMachines: 'main',
      autoplay: true,
      onLoad: () => {
        const inputs = instance.stateMachineInputs('main') ?? [];
        inputsCaption.textContent = `inputs: ${inputs.map((input) => input.name).join(', ')}`;

        const byName = new Map(inputs.map((input) => [input.name, input]));

        expressionSelect.addEventListener('change', () => {
          const index = expressionInput.values.indexOf(expressionSelect.value);
          const input = byName.get('expression');
          if (input) input.value = index;
        });

        loadingCheckbox.addEventListener('change', () => {
          const input = byName.get('loading');
          if (input) input.value = loadingCheckbox.checked;
        });

        for (const [name, button] of triggerNames.map((name, i) => [name, triggerButtons[i]!] as const)) {
          button.addEventListener('click', () => {
            const input = byName.get(name);
            input?.fire();
          });
        }
      },
    });

    const observer = new MutationObserver(() => {
      if (!wrapper.isConnected) {
        instance.cleanup();
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return wrapper;
  },
};
