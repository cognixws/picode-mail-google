const clipped = (s, limit = 1_000_000) => {
  const b = Buffer.from(s);
  if (b.length <= limit) return s;
  let end = limit;
  while ((b[end] & 0xc0) === 0x80) end--;
  return b.subarray(0, end).toString('utf8');
};
const text = html => String(html || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<(br|\/p|\/div|\/li)\b[^>]*>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
export { clipped, text };
