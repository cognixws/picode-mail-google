import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createHost } from '../src/host.mjs';
async function server(t, handler) {
  const instance = http.createServer(handler);
  instance.listen(0, '127.0.0.1');
  await once(instance, 'listening');
  t.after(async () => {
    instance.closeAllConnections();
    await new Promise(resolve => instance.close(resolve));
  });
  return 'http://127.0.0.1:' + instance.address().port;
}
test('missing credentials, foreign origins and URL credentials are refused', () => {
  assert.throws(() => createHost({
    url: '',
    token: 'fixture'
  }));
  assert.throws(() => createHost({
    url: 'http://127.0.0.1',
    token: ''
  }));
  for (const url of ['https://example.com', 'file:///tmp/host', 'http://owner:secret@localhost']) {
    assert.throws(() => createHost({
      url,
      token: 'fixture'
    }));
  }
});
test('host requests carry installation authority and account generation', async t => {
  const calls = [];
  const url = await server(t, async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    calls.push({
      path: req.url,
      token: req.headers['x-picode-extension-token'],
      body: chunks.length ? JSON.parse(Buffer.concat(chunks)) : null
    });
    res.end(JSON.stringify(req.url.endsWith('/accounts') ? [] : {
      ok: true
    }));
  });
  const host = createHost({
    url,
    token: 'fixture'
  });
  const account = {
    id: 'account',
    generation: 'generation'
  };
  await host.accounts();
  await host.read(account, '/reviewed/provider/path');
  await host.commit(account, {
    page: 'next'
  }, [{
    externalId: 'one'
  }], true, 'waiting');
  await host.execute('approved-operation');
  assert.ok(calls.every(call => call.token === 'fixture'));
  assert.deepEqual(calls.map(call => call.path), ['accounts', 'read', 'sync', 'execute'].map(p => '/api/ext/v1/mail/' + p));
  assert.deepEqual(calls[1].body, {
    account: 'account',
    generation: 'generation',
    path: '/reviewed/provider/path'
  });
  assert.equal(calls[2].body.cursor, '{"page":"next"}');
  assert.equal(calls[2].body.reset, true);
  assert.deepEqual(calls[3].body, {
    id: 'approved-operation'
  });
});
test('provider status survives without copying response error text', async t => {
  const url = await server(t, (_req, res) => {
    res.writeHead(409);
    res.end(JSON.stringify({
      providerStatus: 410,
      error: 'sensitive-provider-fixture'
    }));
  });
  await assert.rejects(createHost({
    url,
    token: 'fixture'
  }).read({
    id: 'one',
    generation: 'gen'
  }, '/path'), error => {
    assert.equal(error.status, 409);
    assert.equal(error.providerStatus, 410);
    assert.ok(!error.message.includes('sensitive-provider-fixture'));
    return true;
  });
});
test('a null HTTP error body rejects without an uncaught exception', async t => {
  const url = await server(t, (_req, res) => {
    res.writeHead(502);
    res.end('null');
  });
  await assert.rejects(createHost({ url, token: 'fixture' }).accounts(), error => {
    assert.equal(error.status, 502);
    assert.equal(error.providerStatus, undefined);
    assert.equal(error.message, 'Mail host refused request.');
    return true;
  });
});
test('invalid JSON, response bounds and timeouts reject without retry', async t => {
  for (const mode of ['json', 'size', 'timeout']) {
    let count = 0;
    const url = await server(t, (_req, res) => {
      count++;
      if (mode === 'timeout') return;
      res.end(mode === 'json' ? 'invalid' : JSON.stringify({
        value: 'x'.repeat(100)
      }));
    });
    const host = createHost({
      url,
      token: 'fixture',
      timeout: 50,
      maxBytes: 64
    });
    await assert.rejects(host.accounts());
    assert.equal(count, 1);
  }
});
test('actual entrypoint starts against an empty host and exits on SIGTERM', async t => {
  let sawRequest;
  const received = new Promise(resolve => {
    sawRequest = resolve;
  });
  const url = await server(t, (req, res) => {
    assert.equal(req.url, '/api/ext/v1/mail/accounts');
    assert.equal(req.headers['x-picode-extension-token'], 'fixture');
    res.end('[]');
    sawRequest();
  });
  const child = spawn(process.execPath, [fileURLToPath(new URL('../src/main.mjs', import.meta.url))], {
    env: {
      PICODE_URL: url,
      PICODE_EXT_TOKEN: 'fixture'
    },
    stdio: 'ignore'
  });
  const ended = once(child, 'exit', {
    signal: AbortSignal.timeout(10_000)
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await ended.catch(() => {});
  });
  await Promise.race([received, ended.then(() => {
    throw new Error('Entrypoint exited before connecting.');
  })]);
  child.kill('SIGTERM');
  assert.deepEqual(await ended, [0, null]);
});
