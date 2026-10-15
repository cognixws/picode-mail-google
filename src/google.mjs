import { clipped, text } from './text.mjs';
const decode = value => Buffer.from(value || '', 'base64url').toString('utf8');
function address(value) {
  const raw = String(value || '');
  const match = raw.match(/^(.*?)\s*<([^<>]+)>$/);
  return {
    name: match ? match[1].replace(/^"|"$/g, '') : raw,
    address: match ? match[2] : raw
  };
}
function addressList(value) {
  const parts = [];
  let part = '',
    quoted = false,
    escaped = false,
    angle = false;
  for (const char of String(value || '')) {
    if (char === ',' && !quoted && !angle) {
      if (part.trim()) parts.push(address(part.trim()).address);
      part = '';
      continue;
    }
    part += char;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\' && quoted) {
      escaped = true;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && char === '<') angle = true;
    if (!quoted && char === '>') angle = false;
  }
  if (part.trim()) parts.push(address(part.trim()).address);
  return parts;
}
function googleMessage(m) {
  const headers = Object.fromEntries((m.payload?.headers || []).map(h => [h.name.toLowerCase(), h.value]));
  const from = address(headers.from);
  let plain = '',
    html = '';
  const attachments = [];
  function visit(p) {
    if (p.filename && p.body?.attachmentId) attachments.push({
      id: p.body.attachmentId,
      name: p.filename,
      mime: p.mimeType,
      size: p.body.size || 0
    });else if (p.mimeType === 'text/plain' && p.body?.data) plain += decode(p.body.data);else if (p.mimeType === 'text/html' && p.body?.data) html += decode(p.body.data);
    for (const child of p.parts || []) visit(child);
  }
  visit(m.payload || {});
  return {
    deleted: (m.labelIds || []).some(l => ['SPAM', 'TRASH', 'DRAFT'].includes(l)),
    sent: (m.labelIds || []).includes('SENT'),
    externalId: m.id,
    threadId: m.threadId,
    from: from.address,
    fromName: from.name,
    to: addressList(headers.to),
    cc: addressList(headers.cc),
    subject: clipped(headers.subject || '(No subject)', 2000),
    body: clipped(plain || text(html) || m.snippet || ''),
    truncated: !!m.truncated || Buffer.byteLength(plain || text(html) || m.snippet || '') > 1_000_000 || Buffer.byteLength(headers.subject || '') > 2000 || attachments.length > 50,
    receivedAt: new Date(Number(m.internalDate) || Date.now()).toISOString(),
    messageId: headers['message-id'] || '',
    unread: (m.labelIds || []).includes('UNREAD'),
    archived: !(m.labelIds || []).includes('INBOX'),
    attachments: attachments.slice(0, 50)
  };
}
async function googleFull(a, id, read) {
  const path = '/gmail/v1/users/me/messages/' + encodeURIComponent(id);
  try {
    return await read(a, path + '?format=full');
  } catch (e) {
    if (e.providerStatus !== 200) throw e;
    // A successful response too large for the broker becomes a marked preview.
    return {
      ...(await read(a, path + '?format=metadata')),
      truncated: true
    };
  }
}
async function googleSync(a, c, io) {
  const {
    read,
    commit
  } = io;
  if (!c.mode) {
    const profile = await read(a, '/gmail/v1/users/me/profile');
    c = {
      mode: 'initial',
      history: profile.historyId,
      page: ''
    };
  }
  if (c.mode === 'initial') {
    const q = new URLSearchParams({
      maxResults: '10',
      q: `newer_than:${a.historyDays}d -in:spam -in:trash -in:drafts`
    });
    if (c.page) q.set('pageToken', c.page);
    const result = await read(a, '/gmail/v1/users/me/messages?' + q);
    const messages = [];
    for (const m of result.messages || []) messages.push(googleMessage(await googleFull(a, m.id, read)));
    await commit(a, result.nextPageToken ? {
      ...c,
      page: result.nextPageToken
    } : {
      mode: 'delta',
      history: c.history
    }, messages);
    return true;
  }
  const q = new URLSearchParams({
    startHistoryId: c.history,
    maxResults: '10'
  });
  if (c.page) q.set('pageToken', c.page);
  let result;
  try {
    result = await read(a, '/gmail/v1/users/me/history?' + q);
  } catch (e) {
    if ([404, 410].includes(e.providerStatus)) {
      await commit(a, {}, [], true, "waiting");
      return true;
    }
    throw e;
  }
  const ids = new Set();
  const deleted = new Set();
  for (const h of result.history || []) {
    for (const key of ['messagesAdded', 'labelsAdded', 'labelsRemoved']) for (const change of h[key] || []) ids.add(change.message.id);
    for (const change of h.messagesDeleted || []) deleted.add(change.message.id);
  }
  const messages = [];
  for (const id of ids) {
    try {
      messages.push(googleMessage(await googleFull(a, id, read)));
    } catch (e) {
      if (e.providerStatus === 404) deleted.add(id);else throw e;
    }
  }
  for (const id of deleted) messages.push({
    externalId: id,
    deleted: true
  });
  for (let i = 0; i < messages.length; i += 100) await commit(a, c, messages.slice(i, i + 100));
  await commit(a, result.nextPageToken ? {
    ...c,
    page: result.nextPageToken
  } : {
    mode: 'delta',
    history: result.historyId || c.history
  }, [], false, result.nextPageToken ? 'syncing' : 'ready');
  return !!result.nextPageToken;
}
export { googleMessage, googleSync };
