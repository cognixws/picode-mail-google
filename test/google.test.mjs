import test from 'node:test';
import assert from 'node:assert/strict';
import { googleMessage, googleSync } from '../src/google.mjs';
import { text } from '../src/text.mjs';
const account = {
  id: 'fixture',
  generation: 'one',
  historyDays: 7
};
test('Gmail flags, hostile HTML and bounded UTF-8 bodies', () => {
  assert.equal(text('<script>steal()</script><b>Hello</b>'), 'Hello');
  assert.equal(googleMessage({
    id: 'sent',
    labelIds: ['SENT'],
    payload: {}
  }).sent, true);
  for (const label of ['TRASH', 'SPAM', 'DRAFT']) {
    assert.equal(googleMessage({
      id: label,
      labelIds: [label],
      payload: {}
    }).deleted, true);
  }
  const m = googleMessage({
    id: 'big',
    payload: {
      mimeType: 'text/plain',
      body: {
        data: Buffer.from('é'.repeat(500_001)).toString('base64url')
      }
    }
  });
  assert.equal(m.truncated, true);
  assert.equal(Buffer.byteLength(m.body), 1_000_000);
  assert.ok(!m.body.includes('�'));
});
test('history floor is captured before initial pagination', async () => {
  const calls = [];
  let cursor;
  await googleSync(account, {}, {
    read: async (_a, path) => {
      calls.push(path);
      return path.endsWith('/profile') ? {
        historyId: 'before'
      } : {
        messages: []
      };
    },
    commit: async (_a, value) => {
      cursor = value;
    }
  });
  assert.equal(calls[0], '/gmail/v1/users/me/profile');
  assert.equal(cursor.history, 'before');
  assert.equal(cursor.mode, 'delta');
});
test('expired Gmail cursor explicitly resets cache membership', async () => {
  let saved;
  await googleSync(account, {
    mode: 'delta',
    history: 'old'
  }, {
    read: async () => {
      throw Object.assign(new Error('expired'), {
        providerStatus: 410
      });
    },
    commit: async (_a, cursor, messages, reset, phase) => {
      saved = {
        cursor,
        messages,
        reset,
        phase
      };
    }
  });
  assert.deepEqual(saved, {
    cursor: {},
    messages: [],
    reset: true,
    phase: 'waiting'
  });
});
test('oversize metadata is visibly marked and bounded', () => {
  const headers = [{
    name: 'Subject',
    value: 'é'.repeat(1200)
  }];
  const parts = Array.from({
    length: 51
  }, (_, i) => ({
    filename: 'file' + i,
    body: {
      attachmentId: 'id' + i
    }
  }));
  const m = googleMessage({
    id: 'many',
    payload: {
      headers,
      parts
    }
  });
  assert.equal(m.attachments.length, 50);
  assert.equal(m.truncated, true);
  assert.ok(Buffer.byteLength(m.subject) <= 2000);
  assert.ok(!m.subject.includes('�'));
});
test('oversize provider response advances with a marked metadata preview', async () => {
  let saved;
  await googleSync(account, {
    mode: 'initial',
    history: 'before'
  }, {
    read: async (_a, path) => {
      if (path.includes('?maxResults')) return {
        messages: [{
          id: 'large'
        }]
      };
      if (path.endsWith('format=full')) throw Object.assign(new Error('bounded response'), {
        providerStatus: 200
      });
      return {
        id: 'large',
        threadId: 'thread',
        snippet: 'Preview only',
        payload: {
          headers: []
        }
      };
    },
    commit: async (_a, _c, messages) => {
      saved = messages;
    }
  });
  assert.equal(saved[0].truncated, true);
  assert.equal(saved[0].body, 'Preview only');
});
test('quoted recipient names preserve address boundaries', () => {
  const m = googleMessage({
    id: 'quoted',
    payload: {
      headers: [{
        name: 'To',
        value: '"Doe, Jane" <jane@example.com>, owner@example.com'
      }]
    }
  });
  assert.deepEqual(m.to, ['jane@example.com', 'owner@example.com']);
});
test('delta deduplicates changed messages and retains deletion evidence', async () => {
  const commits = [];
  await googleSync(account, {
    mode: 'delta',
    history: 'before'
  }, {
    read: async (_a, path) => path.includes('/history?') ? {
      historyId: 'after',
      history: [{
        messagesAdded: [{
          message: {
            id: 'one'
          }
        }],
        labelsAdded: [{
          message: {
            id: 'one'
          }
        }],
        messagesDeleted: [{
          message: {
            id: 'gone'
          }
        }]
      }]
    } : {
      id: 'one',
      threadId: 'thread',
      payload: {
        headers: []
      }
    },
    commit: async (_a, cursor, messages, reset, phase) => commits.push({
      cursor,
      messages,
      reset,
      phase
    })
  });
  assert.deepEqual(commits[0].messages.map(m => [m.externalId, !!m.deleted]), [['one', false], ['gone', true]]);
  assert.equal(commits.at(-1).cursor.history, 'after');
  assert.equal(commits.at(-1).phase, 'ready');
});
