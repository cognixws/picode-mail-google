import test from 'node:test';
import assert from 'node:assert/strict';
import { syncCycle, run } from '../src/runtime.mjs';
test('one unavailable account does not block another; only ready operations execute', async () => {
  const executed = [],
    retried = [],
    synced = [],
    logs = [];
  const host = {
    accounts: async () => ['bad', 'good'].map(id => ({
      account: {
        id,
        generation: 'gen'
      },
      cursor: '{}',
      operations: [{
        id: id + '-ready',
        state: 'ready'
      }, {
        id: id + '-uncertain',
        state: 'uncertain'
      }]
    })),
    execute: async id => {
      executed.push(id);
    },
    commit: async (account, cursor, messages, reset, phase) => retried.push({
      account,
      cursor,
      messages,
      reset,
      phase
    })
  };
  const pending = await syncCycle(host, async account => {
    if (account.id === 'bad') throw new Error('fixture');
    synced.push(account.id);
    return true;
  }, {
    log: line => logs.push(line)
  });
  assert.equal(pending, true);
  assert.deepEqual(executed, ['bad-ready', 'good-ready']);
  assert.deepEqual(synced, ['good']);
  assert.equal(retried[0].phase, 'retrying');
  assert.equal(retried[0].account.id, 'bad');
  assert.equal(logs.length, 1);
});
test('an uncertain execution response is not retried inside the cycle', async () => {
  let attempts = 0,
    synchronized = false;
  const host = {
    accounts: async () => [{
      account: {
        id: 'one'
      },
      operations: [{
        id: 'operation',
        state: 'ready'
      }]
    }],
    execute: async () => {
      attempts++;
      throw new Error('unknown response');
    }
  };
  await syncCycle(host, async () => {
    synchronized = true;
    return false;
  }, {
    log: () => {}
  });
  assert.equal(attempts, 1);
  assert.equal(synchronized, true);
});
test('import and idle pacing use 500ms and 30s and can stop without sleeping', async () => {
  for (const pending of [true, false]) {
    const controller = new AbortController();
    const waits = [];
    const host = {
      accounts: async () => [{
        account: {
          id: 'one'
        },
        cursor: 'not-json'
      }]
    };
    await run(host, async (_account, cursor) => {
      assert.deepEqual(cursor, {});
      return pending;
    }, {
      signal: controller.signal,
      wait: async ms => {
        waits.push(ms);
        controller.abort();
      }
    });
    assert.deepEqual(waits, [pending ? 500 : 30_000]);
  }
});
test('unavailable host emits bounded metadata and waits before retry', async () => {
  const controller = new AbortController();
  const logs = [],
    waits = [];
  await run({
    accounts: async () => {
      throw new Error('private error content');
    }
  }, async () => {}, {
    signal: controller.signal,
    log: line => logs.push(line),
    wait: async ms => {
      waits.push(ms);
      controller.abort();
    }
  });
  assert.deepEqual(waits, [30_000]);
  assert.equal(logs.length, 1);
  assert.ok(!logs[0].includes('private error content'));
});
