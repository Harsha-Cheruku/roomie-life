import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { errorResponse, logError } from "../_shared/errors.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          {
            role: 'system',
            content: `You are a highly accurate receipt/bill OCR assistant. Images are pre-processed (grayscale, contrast-stretched, sharpened) for optimal reading. You MUST extract items regardless of image quality.

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
- Extract ALL line items visible at their ORIGINAL printed prices (MRP/list price). Do NOT bake discounts or taxes into item prices.
- Use EXACT item names as printed. If unreadable, use descriptive placeholder like "Item 1"
- Prices MUST be decimal numbers: 12.99 not "12.99" or "₹12.99"
- Remove currency symbols and commas: "1,299.00" → 1299.00
- If quantity shown (e.g., "2 x ₹50"), set quantity=2 and price=50 (per-unit)
- EXCLUDE returned / voided / removed / cancelled items entirely from items[].
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
                text: 'Extract all items from this receipt at their ORIGINAL printed prices and quantities. Exclude any returned/removed/voided items. Sum any discounts/offers/coupons into a single "discount" number. Fold taxes/fees into item prices. "total" = sum(items) − discount.'
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
        max_tokens: 1500,
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
