import http from 'node:http';
import https from 'node:https';

// This is the installation's Host API credential, never a Google OAuth token.
export function createHost({
  url = process.env.PICODE_URL,
  token = process.env.PICODE_EXT_TOKEN,
  timeout = 45_000,
  maxBytes = 32 * 1024 * 1024
} = {}) {
  if (!url || !token) throw new Error('Restart this extension from COGNIX[WS].');
  const base = new URL(url);
  if (!['http:', 'https:'].includes(base.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) || base.username || base.password) {
    throw new Error('A local COGNIX[WS] mail host is required.');
  }
  function request(path, body) {
    const target = new URL('/api/ext/v1/mail/' + path, base);
    return new Promise((resolve, reject) => {
      const data = body === undefined ? null : JSON.stringify(body);
      const headers = {
        'X-PiCode-Extension-Token': token
      };
      if (data !== null) Object.assign(headers, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      });
      const req = (target.protocol === 'https:' ? https : http).request(target, {
        method: data === null ? 'GET' : 'POST',
        headers,
        timeout,
        // Only the validated loopback host above can use the host's local certificate.
        rejectUnauthorized: false
      }, response => {
        let size = 0;
        const chunks = [];
        response.on('error', reject);
        response.on('data', chunk => {
          size += chunk.length;
          if (size > maxBytes) {
            reject(new Error('Host response too large.'));
            response.destroy();
            req.destroy();
          } else chunks.push(chunk);
        });
        response.on('end', () => {
          let value;
          try {
            value = JSON.parse(Buffer.concat(chunks).toString());
          } catch {
            reject(new Error('Invalid host response.'));
            return;
          }
          if (response.statusCode < 200 || response.statusCode >= 300) {
            const error = new Error('Mail host refused request.');
            error.status = response.statusCode;
            error.providerStatus = value?.providerStatus;
            reject(error);
          } else resolve(value);
        });
      });
      req.on('timeout', () => {
        reject(new Error('Host timeout.'));
        req.destroy();
      });
      req.on('error', reject);
      if (data !== null) req.write(data);
      req.end();
    });
  }
  return {
    accounts: () => request('accounts'),
    read: (account, path) => request('read', {
      account: account.id,
      generation: account.generation,
      path
    }),
    commit: (account, cursor, messages, reset = false, phase = 'syncing') => request('sync', {
      account: account.id,
      generation: account.generation,
      cursor: JSON.stringify(cursor),
      messages,
      reset,
      phase
    }),
    execute: id => request('execute', {
      id
    })
  };
}
