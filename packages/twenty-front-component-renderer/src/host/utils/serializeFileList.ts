import { isNumber, isObject, isString } from '@sniptt/guards';

import { registerFrontComponentFile } from '@/host/utils/frontComponentFileRegistry';
import { type SerializedFileData } from '@/types/SerializedFileData';

export const serializeFileList = (
  files: unknown,
): SerializedFileData[] | undefined => {
  if (!isObject(files)) {
    return undefined;
  }
  const fileListLike = files as { length?: unknown } & Record<number, unknown>;
  if (!isNumber(fileListLike.length)) {
    return undefined;
  }

  const serialized: SerializedFileData[] = [];
  for (let index = 0; index < fileListLike.length; index++) {
    const file = fileListLike[index];
    if (!isObject(file)) {
      continue;
    }
    const fileRecord = file as Record<string, unknown>;
    if (
      !isString(fileRecord.name) ||
      !isNumber(fileRecord.size) ||
      !isString(fileRecord.type) ||
      !isNumber(fileRecord.lastModified)
    ) {
      continue;
    }
    serialized.push({
      name: fileRecord.name,
      size: fileRecord.size,
      type: fileRecord.type,
      lastModified: fileRecord.lastModified,
      // Propel fork: stash the real File on the host and hand the worker an
      // opaque token it can exchange for the bytes via the
      // `readFrontComponentFile` host RPC. The bytes never cross here.
      token: registerFrontComponentFile(file),
    });
  }

  return serialized;
};
