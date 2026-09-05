/**
 * Minimal ZIP writer (stored, no compression) for `.lottie` bundles. dotLottie readers (e.g.
 * `dotlottie-rs`'s `Archive`) do not validate CRC32 for stored entries, so it is left as 0; if
 * that ever changes, compute it here before shipping.
 */
export interface ZipEntry {
  name: string;
  data: Buffer;
}

const LOCAL_SIG = 0x04034b50;
const CDIR_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;

export function zip(entries: ZipEntry[]): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_SIG, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method: stored
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0, 12); // mod date
    local.writeUInt32LE(0, 14); // crc32
    local.writeUInt32LE(data.length, 18); // compressed size
    local.writeUInt32LE(data.length, 22); // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra len
    chunks.push(local, nameBuf, data);

    const cdir = Buffer.alloc(46);
    cdir.writeUInt32LE(CDIR_SIG, 0);
    cdir.writeUInt16LE(20, 4); // version made by
    cdir.writeUInt16LE(20, 6); // version needed
    cdir.writeUInt16LE(0, 8); // flags
    cdir.writeUInt16LE(0, 10); // method: stored
    cdir.writeUInt16LE(0, 12); // mod time
    cdir.writeUInt16LE(0, 14); // mod date
    cdir.writeUInt32LE(0, 16); // crc32
    cdir.writeUInt32LE(data.length, 20); // compressed size
    cdir.writeUInt32LE(data.length, 24); // uncompressed size
    cdir.writeUInt16LE(nameBuf.length, 28);
    cdir.writeUInt16LE(0, 30); // extra len
    cdir.writeUInt16LE(0, 32); // comment len
    cdir.writeUInt16LE(0, 34); // disk number
    cdir.writeUInt16LE(0, 36); // internal attrs
    cdir.writeUInt32LE(0, 38); // external attrs
    cdir.writeUInt32LE(offset, 42); // local header offset
    central.push(cdir, nameBuf);

    offset += local.length + nameBuf.length + data.length;
  }

  const centralBuf = Buffer.concat(central);
  const cdirOffset = offset;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIG, 0);
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with central dir
  eocd.writeUInt16LE(entries.length, 8); // entries on this disk
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(centralBuf.length, 12); // central dir size
  eocd.writeUInt32LE(cdirOffset, 16); // central dir offset
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...chunks, centralBuf, eocd]);
}
