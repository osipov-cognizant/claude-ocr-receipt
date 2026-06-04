'use strict';

const fsp = require('fs/promises');
const config = require('../config');
const logger = require('../logger');
const { imagePathFor } = require('../store');

const EXTRACTION_PROMPT = `You are a precise receipt parser. You are given a photo of a grocery store receipt.
Extract the contents and respond with ONLY a JSON object (no markdown, no commentary) of this exact shape:

{
  "store": { "name": string | null, "date": string | null },
  "items": [
    {
      "description": string,      // the printed line-item name, cleaned up
      "sku": string | null,        // item/SKU number if printed, else null
      "qty": number | null,
      "unitPrice": number | null,
      "price": number              // the charged amount for the line, as a number
    }
  ],
  "totals": { "subtotal": number | null, "tax": number | null, "total": number | null }
}

Rules:
- Only include real purchased products. Exclude subtotals, tax lines, totals, payment/tender lines, savings, and store info from "items".
- Prices are plain numbers (e.g. 12.99), never strings, never with currency symbols.
- If a value is not present, use null. Never invent SKUs or prices.
- "date" should be ISO-ish (YYYY-MM-DD) when you can determine it, otherwise the raw printed date or null.`;

function bufferToBase64(buf) {
  return buf.toString('base64');
}

function safeJson(text) {
  if (!text) return null;
  let t = text.trim();
  // Strip ```json fences if the model added them despite instructions.
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  // Fall back to the first {...} block.
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) t = t.slice(start, end + 1);
  try {
    return JSON.parse(t);
  } catch (err) {
    logger.warn({ err: err.message }, 'vision: failed to parse model JSON');
    return null;
  }
}

async function extractWithAnthropic(base64, mimeType) {
  const { apiKey, model, version, baseUrl } = config.vision.anthropic;
  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': version,
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
            { type: 'text', text: EXTRACTION_PROMPT },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
  return text;
}

async function extractWithOpenAI(base64, mimeType) {
  const { apiKey, model, baseUrl } = config.vision.openai;
  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: EXTRACTION_PROMPT },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI API ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * @returns {Promise<{ rawText: string|null, structured: object|null }>}
 */
async function extract(record) {
  const provider = config.vision.provider;
  const buf = await fsp.readFile(imagePathFor(record));
  const base64 = bufferToBase64(buf);
  let mimeType = record.image.mimeType;
  if (!/^image\//.test(mimeType)) mimeType = 'image/jpeg';

  let text;
  if (provider === 'openai') {
    text = await extractWithOpenAI(base64, mimeType);
  } else {
    text = await extractWithAnthropic(base64, mimeType);
  }
  const structured = safeJson(text);
  return { rawText: text, structured };
}

module.exports = { extract };
