export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    };

    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const apiKey = env.OPENAI_API_KEY;
    const apiUrl = "https://api.openai.com/v1/chat/completions";
    const userInput = await request.json();

    // Build a friendly, brand-agnostic system prompt for a product advisor persona
    const systemMessage = {
      role: "system",
      content: `You are a friendly product advisor for skincare, haircare, makeup, fragrance, and personal care products. Be warm, professional, and helpful. When asked to build a routine, use the provided products and their descriptions; give clear, step-by-step routines, explain why each product is used and when to apply it, and offer gentle tips and alternatives when appropriate. Keep tone friendly and enthusiastic, and keep answers concise and practical. If important details are missing (skin type, hair type, concern), ask a short clarifying question before providing a full routine.`,
    };

    // Ensure we have a messages array to send. If the client sent `messages`, use it, otherwise create an array.
    let messages = Array.isArray(userInput.messages)
      ? [...userInput.messages]
      : [];

    // If the client included a `products` array, append a readable summary to the messages
    if (Array.isArray(userInput.products) && userInput.products.length) {
      const productSummary = userInput.products
        .map(
          (p) =>
            `- ${p.name} (${p.brand}) — ${p.category}: ${p.description || ""}`
        )
        .join("\n");
      messages.push({
        role: "user",
        content: `Selected products:\n${productSummary}`,
      });
    }

    // Prepend the system message so the assistant uses the friendly L'Oréal persona
    messages = [systemMessage, ...messages];

    const requestBody = {
      model: "gpt-4o",
      messages,
      max_tokens: 800,
      temperature: 0.5,
      frequency_penalty: 0.8,
    };

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    // Return OpenAI's response directly to the client (caller expects JSON).
    return new Response(JSON.stringify(data), { headers: corsHeaders });
  },
};
