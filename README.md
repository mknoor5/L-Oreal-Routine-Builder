# Project 9: L'Oréal Routine Builder

L’Oréal is expanding what’s possible with AI, and now your chatbot is getting smarter. This week, you’ll upgrade it into a product-aware routine builder.

Users will be able to browse real L’Oréal brand products, select the ones they want, and generate a personalized routine using AI. They can also ask follow-up questions about their routine—just like chatting with a real advisor.

## Setup Cloudflare Worker (example)

1. Deploy the example worker at `worker/worker.example.js` to Cloudflare Workers.
2. Store your OpenAI API key as a secret in the Worker (do NOT commit it to this repo).
3. Update `WORKER_URL` in `script.js` with your deployed worker URL.
4. Open `index.html` in a browser and choose products, then click "Generate Routine".

Notes:

- The example worker shows how to forward requests to OpenAI. Customize the prompt and security (CORS, auth) as needed.
- If `WORKER_URL` is empty, the UI will still allow product selection and localStorage persistence, but AI chat/routine features will be disabled until you configure the worker.
