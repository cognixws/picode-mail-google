// Leave room for the request envelope below the host's 32 MiB limit.
// Count serialized bytes: escaping can make a 1 MB body much larger on the wire.
export function messageBatches(messages) {
  const batches = [];
  let batch = [], bytes = 2;
  for (const message of messages) {
    const size = Buffer.byteLength(JSON.stringify(message)) + 1;
    if (size > 16 * 1024 * 1024) throw new Error('Email metadata exceeds the sync batch limit.');
    if (batch.length && (batch.length === 100 || bytes + size > 16 * 1024 * 1024)) {
      batches.push(batch);
      batch = [];
      bytes = 2;
    }
    batch.push(message);
    bytes += size;
  }
  if (batch.length) batches.push(batch);
  return batches;
}
