import { withStore } from "./push-store.mjs";
import { withBlobStore } from "./push-blob.mjs";

export function pushStoreIsRemote() {
  return Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
}

export function withPushStore(file, fn) {
  if (pushStoreIsRemote()) return withBlobStore(fn);
  return withStore(file, fn);
}
