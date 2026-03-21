import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
        model: 'google/gemini-2.5-flash',
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
  "total": 24.49
}

CRITICAL RULES:
- Extract ALL line items visible, even if partially readable — use best guess for unclear text
- Use EXACT item names as printed. If unreadable, use descriptive placeholder like "Item 1"
- Prices MUST be decimal numbers: 12.99 not "12.99" or "₹12.99"
- Remove currency symbols and commas: "1,299.00" → 1299.00
- If quantity shown (e.g., "2 x ₹50"), set quantity=2 and price=50 (per-unit)
- Include discount/offer lines as negative price items
- "total" should match receipt total. If not visible, SUM all (price × quantity)
- Handle Indian receipts: ₹ symbol, GST/CGST/SGST lines, MRP formats
- For faded/old bills: look for number patterns, column alignment, and price formats
- The image is already grayscale and contrast-enhanced — focus on text extraction
- If completely unreadable, return { "error": "Could not read receipt" }
- Return ONLY JSON, no markdown, no explanation`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract all items from this receipt with accurate prices and quantities. The image may be blurry or low quality — extract everything you can read.'
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
        max_tokens: 4000,
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
      console.error('Failed to parse AI response:', parseError, 'Content:', content);
      return new Response(JSON.stringify({ error: 'Failed to parse receipt data' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (parsedResult.error) {
      return new Response(JSON.stringify({ error: parsedResult.error }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('Extracted receipt data:', parsedResult);

    return new Response(JSON.stringify(parsedResult), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error processing receipt:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
