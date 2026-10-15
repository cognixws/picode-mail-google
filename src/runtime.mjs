import { setTimeout as delay } from 'node:timers/promises';
function savedCursor(raw) {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}
export async function syncCycle(host, sync, {
  signal,
  log = console.error
} = {}) {
  let pending = false;
  for (const {
    account,
    cursor,
    operations
  } of await host.accounts()) {
    if (signal?.aborted) break;
    try {
      for (const operation of operations || []) {
        if (operation.state !== 'ready') continue;
        try {
          await host.execute(operation.id);
        } catch {
          log('Email operation unavailable; preserved without replay.');
        }
      }
      pending = (await sync(account, savedCursor(cursor), host)) || pending;
    } catch {
      try {
        await host.commit(account, savedCursor(cursor), [], false, 'retrying');
      } catch {}
      log('One email account is unavailable; other accounts continue.');
    }
  }
  return pending;
}
export async function run(host, sync, {
  signal,
  log = console.error,
  wait = delay
} = {}) {
  while (!signal?.aborted) {
    let pending = false;
    try {
      pending = await syncCycle(host, sync, {
        signal,
        log
      });
    } catch {
      log('Email synchronization unavailable; retrying without replaying sends.');
    }
    if (signal?.aborted) break;
    try {
      await wait(pending ? 500 : 30_000, undefined, {
        signal
      });
    } catch (error) {
      if (!signal?.aborted) throw error;
    }
  }
}
