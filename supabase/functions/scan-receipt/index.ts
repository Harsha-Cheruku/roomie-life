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
        model: 'google/gemini-2.5-pro',
        messages: [
          {
            role: 'system',
            content: `You are a highly accurate receipt OCR assistant. Your job is to extract EVERY item from receipt images with precise prices.

Return ONLY a valid JSON object with this exact structure:
{
  "title": "Store name or receipt title",
  "items": [
    { "name": "Item name", "price": 12.99, "quantity": 1 },
    { "name": "Another item", "price": 5.50, "quantity": 2 }
  ],
  "total": 24.49
}

CRITICAL RULES FOR ACCURACY:
- Extract ALL line items visible on the receipt — do not skip any
- Use EXACT item names as printed on the receipt
- Prices MUST be decimal numbers (e.g., 12.99 not "12.99" or "₹12.99" or "$12.99")
- Remove currency symbols, commas from prices — "1,299.00" becomes 1299.00
- If quantity is shown (e.g., "2 x ₹50"), set quantity=2 and price=50 (per-unit price)
- If a discount/offer line exists, include it as a negative price item
- The "total" field should match the receipt's total. If not visible, SUM all (price × quantity) values
- Verify: sum of (item.price × item.quantity) should approximately equal total
- For Indian receipts: handle ₹ symbol, GST/CGST/SGST lines, MRP, and common formats
- If you can't read the receipt clearly, return { "error": "Could not read receipt" }
- Return ONLY the JSON object, no markdown, no explanation, no extra text`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract all items from this receipt with accurate prices and quantities. Double-check each price matches what is printed.'
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
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'Failed to process receipt' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    console.log('AI response:', content);

    if (!content) {
      return new Response(
        JSON.stringify({ error: 'No response from AI' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse the JSON from the response
    let parsedResult;
    try {
      // Remove any markdown code blocks if present
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsedResult = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError, 'Content:', content);
      return new Response(
        JSON.stringify({ error: 'Failed to parse receipt data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (parsedResult.error) {
      return new Response(
        JSON.stringify({ error: parsedResult.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Extracted receipt data:', parsedResult);

    return new Response(
      JSON.stringify(parsedResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing receipt:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
