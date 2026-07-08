export type SerializedFileData = {
  name: string;
  size: number;
  type: string;
  lastModified: number;
  // Propel fork: opaque handle to the real File held on the host. The worker
  // passes it to the `readFrontComponentFile` host RPC to pull the bytes on
  // demand. Absent when the host can't register the file (e.g. an older host);
  // callers treat that as "bytes unavailable".
  token?: string;
};
