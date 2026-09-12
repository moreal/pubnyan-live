import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { clip, key, track } from '#ir/clip.ts';
import type { Rig } from '#ir/types.ts';
import { verifyClips, verificationWorkers } from './pipeline.ts';

const rig: Rig = {name:'pipeline-fixture',artboard:{width:20,height:20},parts:[
  {name:'square',fill:'#000000',pivot:[5,5],path:'M1 1L9 1L9 9L1 9Z'},
],expressions:{}};
const examples = ['fixture-parallel-first','fixture-parallel-second'].map(name => clip(name,
  {rig:rig.name,duration:0.1,fps:60,loop:false},[
    track('square','position',[key(0,[0,0]),key(0.1,[2,0])]),
  ]));

test.each(['0', '-1', '1.5', 'NaN', 'Infinity', ''])('rejects unsafe VERIFY_WORKERS=%s', value => {
  expect(() => verificationWorkers(value)).toThrow(/positive integer/);
});

test('parallel and serial clip verification retain every target and sample result in order', async () => {
  const out = await mkdtemp(join(tmpdir(),'pubnyan-pipeline-test-'));
  try {
    const serial = await verifyClips(examples, () => rig, {workers:1,outputDir:join(out,'serial'),verifyDir:join(out,'serial','verify')});
    const parallel = await verifyClips(examples, () => rig, {workers:2,outputDir:join(out,'parallel'),verifyDir:join(out,'parallel','verify')});
    expect(parallel.report.map(({clip,target,pass,skipped})=>({clip,target,pass,skipped}))).toEqual([
      {clip:'fixture-parallel-first',target:'svg',pass:true,skipped:[]},
      {clip:'fixture-parallel-first',target:'lottie',pass:true,skipped:[]},
      {clip:'fixture-parallel-first',target:'rive',pass:true,skipped:[]},
      {clip:'fixture-parallel-second',target:'svg',pass:true,skipped:[]},
      {clip:'fixture-parallel-second',target:'lottie',pass:true,skipped:[]},
      {clip:'fixture-parallel-second',target:'rive',pass:true,skipped:[]},
    ]);
    expect(parallel.report).toEqual(serial.report);
    for (const timing of parallel.timings) {
      expect(timing.totalMs).toBeGreaterThan(0);
      expect(timing.referenceMs).toBeGreaterThan(0);
      expect(Object.keys(timing.targetMs)).toEqual(['svg','lottie','rive']);
      const contact=await readFile(join(out,'parallel','verify',`${timing.clip}-contact.png`));
      expect(contact.subarray(1,4).toString()).toBe('PNG');
    }
  } finally {
    await rm(out,{recursive:true,force:true});
    await Promise.all(examples.map(c=>rm(new URL(`../../../dist/svg/${c.name}.svg`,import.meta.url),{force:true})));
  }
});
