import { inflateRawSync } from 'zlib';

function findEndOfCentralDirectory(buffer: Buffer): number {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  throw new Error('ZIP end-of-central-directory record not found.');
}

export function extractZipEntry(buffer: Buffer, entryName: string): Buffer {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);

  let cursor = centralDirectoryOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    const signature = buffer.readUInt32LE(cursor);
    if (signature !== 0x02014b50) {
      throw new Error('ZIP central-directory entry is malformed.');
    }

    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraFieldLength = buffer.readUInt16LE(cursor + 30);
    const fileCommentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const fileName = buffer.toString('utf8', cursor + 46, cursor + 46 + fileNameLength);

    if (fileName === entryName) {
      const localSignature = buffer.readUInt32LE(localHeaderOffset);
      if (localSignature !== 0x04034b50) {
        throw new Error(`ZIP local-file header missing for ${entryName}.`);
      }

      const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraFieldLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const payloadOffset = localHeaderOffset + 30 + localFileNameLength + localExtraFieldLength;
      const payload = buffer.subarray(payloadOffset, payloadOffset + compressedSize);

      if (compressionMethod === 0) {
        return payload;
      }
      if (compressionMethod === 8) {
        return inflateRawSync(payload);
      }

      throw new Error(`Unsupported ZIP compression method ${compressionMethod} for ${entryName}.`);
    }

    cursor += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  throw new Error(`ZIP entry not found: ${entryName}`);
}
