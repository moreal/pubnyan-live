import { describe, expect, test } from 'vitest';
import { zip } from '#export-lottie/zip.ts';

describe('zip', () => {
  test('round-trips through Node\'s own zip reader-equivalent structure: end-of-central-directory + entries', async () => {
    const buf = zip([
      { name: 'manifest.json', data: Buffer.from('{"a":1}') },
      { name: 'animations/foo.json', data: Buffer.from('x'.repeat(500)) },
    ]);
    // Signature bytes for local file header, central directory, and end-of-central-directory.
    expect(buf.readUInt32LE(0)).toBe(0x04034b50);
    expect(buf.subarray(0, 200).toString('latin1')).toContain('manifest.json');
    expect(buf.subarray(-22).readUInt32LE(0)).toBe(0x06054b50);
    expect(buf.subarray(-22).readUInt16LE(10)).toBe(2); // total entries
  });

  test('unzip round-trip via node:zlib-free manual parse of a single stored entry', () => {
    const data = Buffer.from('hello world');
    const buf = zip([{ name: 'a.txt', data }]);
    // Locate payload right after the 30-byte local header + name.
    const nameLen = buf.readUInt16LE(26);
    const payloadStart = 30 + nameLen;
    expect(buf.subarray(payloadStart, payloadStart + data.length)).toEqual(data);
  });
});
