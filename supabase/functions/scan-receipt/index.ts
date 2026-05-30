import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { errorResponse, logError } from "../_shared/errors.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODEL = 'google/gemini-2.5-flash';

const sha256Hex = async (bytes: Uint8Array) => {
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

const getUserIdFromAuth = (req: Request): string | null => {
  try {
    const auth = req.headers.get('Authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    const payload = token.split('.')[1];
    if (!payload) return null;
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const json = JSON.parse(atob(padded.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json?.sub === 'string' ? json.sub : null;
  } catch { return null; }
};

const supabaseAdmin = () => {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
};

const toMoney = (value: unknown) => {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? Math.round(Math.abs(n) * 100) / 100 : 0;
};

const extractJSON = (raw: string) => {
  let cleaned = raw.replace(/^```json\s*/im, '').replace(/^```\s*/im, '').replace(/```\s*$/im, '').trim();
  if (!cleaned.startsWith('{')) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('No valid JSON object found');
    cleaned = cleaned.slice(start, end + 1);
  }
  return JSON.parse(cleaned);
};

const normalizeReceipt = (result: any) => {
  const items = Array.isArray(result.items) ? result.items
    .map((item: any, index: number) => ({
      name: String(item?.name || `Item ${index + 1}`).trim(),
      price: toMoney(item?.price),
      quantity: Math.max(1, Math.round(Number(item?.quantity) || 1)),
    }))
    .filter((item: any) => item.price > 0) : [];

  const adjustments = Array.isArray(result.adjustments) ? result.adjustments
    .map((adj: any) => {
      const rawType = String(adj?.type || '').toLowerCase();
      const label = String(adj?.label || 'Adjustment').trim();
      const type = rawType === 'tax' || rawType === 'discount' || rawType === 'fee'
        ? rawType
        : /gst|vat|tax/i.test(label) ? 'tax'
          : /discount|coupon|promo|offer|save|off|loyalty|round.*down/i.test(label) ? 'discount'
            : 'fee';
      return { label, amount: toMoney(adj?.amount), type };
    })
    .filter((adj: any) => adj.amount > 0) : [];

  const subtotal = items.reduce((sum: number, item: any) => sum + item.price * item.quantity, 0);
  const added = adjustments.filter((a: any) => a.type !== 'discount').reduce((sum: number, a: any) => sum + a.amount, 0);
  const removed = adjustments.filter((a: any) => a.type === 'discount').reduce((sum: number, a: any) => sum + a.amount, 0);
  const computedTotal = Math.max(0, Math.round((subtotal + added - removed) * 100) / 100);
  const printedTotal = toMoney(result.total);

  if (printedTotal > 0 && Math.abs(printedTotal - computedTotal) > 0.05 && subtotal > 0) {
    const diff = Math.round((printedTotal - computedTotal) * 100) / 100;
    adjustments.push({ label: 'Total correction', amount: Math.abs(diff), type: diff > 0 ? 'fee' : 'discount' });
  }

  return {
    title: String(result.title || 'Scanned Receipt').trim(),
    items,
    adjustments,
    total: printedTotal > 0 ? printedTotal : computedTotal,
  };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let imageBase64: string | undefined;
    let imageMime = 'image/jpeg';
    let rawBytes: Uint8Array | null = null;
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      // Preferred path: binary upload via FormData — avoids the 33%
      // base64 inflation and the giant JSON string that was causing
      // timeouts/OOM on mobile networks.
      const form = await req.formData();
      const file = form.get('image');
      if (!(file instanceof File)) {
        return new Response(
          JSON.stringify({ error: 'No image file provided' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      imageMime = file.type || 'image/jpeg';
      const buf = new Uint8Array(await file.arrayBuffer());
      rawBytes = buf;
      // Chunked base64 encode to keep peak memory low for large images.
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < buf.length; i += chunk) {
        binary += String.fromCharCode(...buf.subarray(i, i + chunk));
      }
      imageBase64 = `data:${imageMime};base64,${btoa(binary)}`;
    } else {
      const body = await req.json().catch(() => ({} as { imageBase64?: string }));
      imageBase64 = body.imageBase64;
      if (imageBase64) {
        try {
          const b64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
          const bin = atob(b64);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          rawBytes = arr;
        } catch { /* ignore */ }
      }
    }

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: 'No image provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ---- Rate limit + cache (best-effort; failures don't break scanning) ----
    const admin = supabaseAdmin();
    const userId = getUserIdFromAuth(req);
    const inputHash = rawBytes ? await sha256Hex(rawBytes) : null;
    const cacheKey = inputHash ? `${MODEL}:${inputHash}` : null;

    if (admin && cacheKey) {
      try {
        const { data: cached } = await admin
          .from('ai_response_cache')
          .select('response')
          .eq('input_hash', cacheKey)
          .maybeSingle();
        if (cached?.response) {
          console.log('Cache HIT for', cacheKey.slice(0, 24));
          admin.from('ai_response_cache')
            .update({ last_used_at: new Date().toISOString(), hit_count: (cached as any).hit_count ? undefined : undefined })
            .eq('input_hash', cacheKey)
            .then(() => {});
          return new Response(JSON.stringify({ ...cached.response, cached: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
          });
        }
      } catch (e) { console.warn('cache lookup failed', e); }
    }

    if (admin && userId) {
      try {
        const { data: rl } = await admin.rpc('check_ai_rate_limit', {
          _user_id: userId,
          _endpoint: 'scan-receipt',
          _max_calls: 10,
          _window_seconds: 60,
          _cooldown_seconds: 60,
        });
        const row = Array.isArray(rl) ? rl[0] : rl;
        if (row && row.allowed === false) {
          return new Response(
            JSON.stringify({
              error: `Too many scans. Please wait ${row.retry_after_seconds}s before trying again.`,
              retry_after: row.retry_after_seconds,
            }),
            {
              status: 429,
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json',
                'Retry-After': String(row.retry_after_seconds || 60),
              },
            }
          );
        }
      } catch (e) { console.warn('rate limit check failed', e); }
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing receipt image with AI...');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `You are a highly accurate receipt/bill OCR assistant for grocery, restaurant, delivery, supermarket and Indian GST bills. Images may be skewed, shadowed, blurry, folded, cropped, thermal/faded, or low light. Carefully read columns and totals; do not invent unreadable lines.

Return ONLY a valid JSON object with this exact structure:
{
  "title": "Store name or receipt title",
  "items": [
    { "name": "Item name", "price": 12.99, "quantity": 1 }
  ],
  "adjustments": [
    { "label": "GST", "amount": 18.50, "type": "tax" },
    { "label": "Service Charge", "amount": 25.00, "type": "fee" },
    { "label": "Coupon SAVE10", "amount": 50.00, "type": "discount" }
  ],
  "total": 24.49
}

CRITICAL RULES:
- Extract ALL visible bill detail rows: item name, original printed unit price, quantity, taxes, fees, discounts, round off, packing/delivery/service charges, tips and final payable total.
- Extract line items at their ORIGINAL printed prices. Do NOT bake discounts, taxes or fees into item prices.
- Use EXACT item names as printed. If unreadable, use descriptive placeholder like "Item 1"
- Prices MUST be decimal numbers: 12.99 not "12.99" or "₹12.99"
- Remove currency symbols and commas: "1,299.00" → 1299.00
- If quantity shown (e.g., "2 x ₹50", "2 @ 50", "QTY 2 RATE 50 AMT 100"), set quantity=2 and price=50 per unit.
- EXCLUDE returned / voided / removed / cancelled items entirely from items[].
- Do not treat subtotal, total, amount paid, balance, cash/card, payment reference or invoice number as an item.
- "adjustments" MUST list every separately-printed charge or deduction so the user can review/delete/edit them. Each entry:
    • "label": exact text printed on the receipt (e.g. "CGST 9%", "Service Charge", "Tip", "Round Off", "Coupon SAVE10").
    • "amount": positive decimal magnitude (never negative — the sign is implied by "type").
    • "type": one of:
        - "tax"      → GST / CGST / SGST / IGST / VAT / service tax  (ADDED to total)
        - "fee"      → service charge / delivery / packaging / convenience / tip / round-up  (ADDED to total)
        - "discount" → discount / offer / coupon / promo / "save" / "off" / round-off-down / loyalty  (SUBTRACTED from total)
  Return [] if none. Do NOT fold taxes/fees/discounts into item prices.
- "total" MUST equal the final payable grand total printed on the receipt.
  It should equal SUM(price × quantity) + sum(tax+fee amounts) − sum(discount amounts) within ±0.05.
  If grand total is not printed, compute it from the items + adjustments above.
- Handle Indian receipts: ₹ symbol, GST/CGST/SGST lines, MRP formats
- The image may be a phone photo: handle perspective skew, glare, shadows,
  crumpled paper, low light, motion blur and partially cut edges. Use column
  alignment and price-format patterns (e.g. ##.##) to recover unclear digits.
- For faded / thermal / old bills: rely on number patterns and layout
- If completely unreadable, return { "error": "Could not read receipt" }
- Return ONLY JSON, no markdown, no explanation`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract every visible bill detail into JSON. Keep items editable by returning item name, per-unit original price, and quantity. Return each tax, fee, discount, coupon, service charge, delivery/packing charge, tip and round-off as a separate adjustments entry. Do not fold taxes or discounts into item prices. Final total must be the printed payable total.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`
                }
              }
            ]
          }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 2500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      
      return new Response(JSON.stringify({ error: 'Failed to process receipt' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    console.log('AI response:', content);

    if (!content) {
      return new Response(JSON.stringify({ error: 'No response from AI' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let parsedResult;
    try {
      parsedResult = normalizeReceipt(extractJSON(content));
    } catch (parseError) {
      logError('scan-receipt:parse', parseError);
      return new Response(JSON.stringify({ error: 'Failed to parse receipt data' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (parsedResult.error) {
      return new Response(JSON.stringify({ error: parsedResult.error }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!parsedResult.items || parsedResult.items.length === 0) {
      return new Response(JSON.stringify({ error: 'Could not read receipt items. Try again with a clearer photo or upload from gallery.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('Extracted receipt data:', parsedResult);

    if (admin && cacheKey) {
      admin.from('ai_response_cache')
        .upsert({
          input_hash: cacheKey,
          model: MODEL,
          response: parsedResult,
          last_used_at: new Date().toISOString(),
        }, { onConflict: 'input_hash' })
        .then(({ error }) => { if (error) console.warn('cache write failed', error); });
    }

    return new Response(JSON.stringify(parsedResult), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return errorResponse('scan-receipt', error, corsHeaders);
  }
});
