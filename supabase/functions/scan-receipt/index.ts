import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { errorResponse, logError } from "../_shared/errors.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const { imageBase64 } = await req.json();
    
    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: 'No image provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
        model: 'google/gemini-2.5-flash',
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
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsedResult = JSON.parse(cleanContent);
    } catch (parseError) {
      logError('scan-receipt:parse', parseError);
      return new Response(JSON.stringify({ error: 'Failed to parse receipt data' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (parsedResult.error) {
      return new Response(JSON.stringify({ error: parsedResult.error }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('Extracted receipt data:', parsedResult);

    return new Response(JSON.stringify(parsedResult), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return errorResponse('scan-receipt', error, corsHeaders);
  }
});
