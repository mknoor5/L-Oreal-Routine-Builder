/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const selectedProductsList = document.getElementById("selectedProductsList");
const generateRoutineBtn = document.getElementById("generateRoutine");
const clearSelectionsBtn = document.getElementById("clearSelections");

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

/* App state */
let allProducts = [];
let selectedProductIds = new Set();
let conversation = []; // chat history: { role: 'user'|'assistant'|'system', content }

const WORKER_URL = "https://lorealroutine.mknoor.workers.dev/"; // <-- Set your Cloudflare Worker endpoint here (e.g. https://your-worker.example.workers.dev)

/* Load product data from JSON file */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  productsContainer.innerHTML = products
    .map((product) => {
      const selected = selectedProductIds.has(String(product.id))
        ? "selected"
        : "";
      return `
    <div class="product-card ${selected}" data-id="${product.id}">
      <div class="select-badge" aria-hidden>${selected ? "✓" : ""}</div>
      <img src="${product.image}" alt="${product.name}">
      <div class="product-info">
        <h3>${product.name}</h3>
        <p>${product.brand}</p>
        <button class="desc-toggle" data-id="${
          product.id
        }">Show description</button>
        <div class="description" data-id="${product.id}">${
        product.description || "No description."
      }</div>
      </div>
    </div>
  `;
    })
    .join("");

  // Attach event handlers for cards and description toggles
  document.querySelectorAll(".product-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      // If the user clicked the description toggle button, ignore here
      if (e.target.closest(".desc-toggle")) return;
      const id = card.getAttribute("data-id");
      toggleSelectProduct(id);
    });
  });

  document.querySelectorAll(".desc-toggle").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      const card = btn.closest(".product-card");
      const expanded = card.classList.toggle("expanded");
      btn.textContent = expanded ? "Hide description" : "Show description";
    });
  });
}

function saveSelections() {
  const arr = Array.from(selectedProductIds);
  localStorage.setItem("selectedProducts", JSON.stringify(arr));
}

function loadSelections() {
  try {
    const raw = localStorage.getItem("selectedProducts");
    if (!raw) return;
    const arr = JSON.parse(raw);
    selectedProductIds = new Set(arr.map(String));
  } catch (err) {
    console.warn("Could not load selections", err);
  }
}

function updateSelectedList() {
  const products = allProducts.filter((p) =>
    selectedProductIds.has(String(p.id))
  );
  selectedProductsList.innerHTML = "";
  products.forEach((p) => {
    const el = document.createElement("div");
    el.className = "selected-item";
    el.innerHTML = `${p.name} <button data-id="${p.id}" aria-label="Remove ${p.name}">Remove</button>`;
    el.querySelector("button").addEventListener("click", () => {
      toggleSelectProduct(p.id);
    });
    selectedProductsList.appendChild(el);
  });

  // (removed dynamic clear control — persistent Clear button is in the UI)
}

function toggleSelectProduct(id) {
  const normalized = String(id);
  if (selectedProductIds.has(normalized)) selectedProductIds.delete(normalized);
  else selectedProductIds.add(normalized);
  saveSelections();
  renderProductsAndList();
}

function renderProductsAndList() {
  const currentCategory = categoryFilter.value;

  // If no category is selected, show the placeholder message and do not render products.
  if (!currentCategory) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        Select a category to view products
      </div>
    `;
    updateSelectedList();
    return;
  }

  const filtered = allProducts.filter((p) => p.category === currentCategory);
  displayProducts(filtered);
  updateSelectedList();
}

/* Filter and display products when category changes */
categoryFilter.addEventListener("change", (e) => {
  // When the user selects a category, render products for that category.
  // `allProducts` is loaded during init; no need to fetch again here.
  renderProductsAndList();
});

/* Chat form submission handler */
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("userInput");
  const text = input.value.trim();
  if (!text) return;
  appendChatMessage("user", text);
  input.value = "";
  sendChatToWorker(text);
});

/** Generate Routine button behaviour */
generateRoutineBtn.addEventListener("click", async () => {
  const selected = allProducts.filter((p) =>
    selectedProductIds.has(String(p.id))
  );
  if (!selected.length) {
    appendChatMessage(
      "assistant",
      "Please select at least one product before generating a routine,"
    );
    return;
  }

  appendChatMessage("user", "Generate a routine for the selected products.");
  const payloadProducts = selected.map((p) => ({
    name: p.name,
    brand: p.brand,
    category: p.category,
    description: p.description,
  }));

  // Also include a readable product summary in the conversation so the Worker
  // can see the selected products regardless of which field it parses.
  // Only include product names in the chatbox summary (Worker will still get full product objects)
  const productSummary = payloadProducts.map((p) => `- ${p.name}`).join("\n");
  appendChatMessage("user", `Selected products:\n${productSummary}`);

  try {
    await callWorker({
      type: "generate_routine",
      products: payloadProducts,
    });
  } catch (err) {
    console.error(err);
    appendChatMessage("assistant", "Error generating routine: " + err.message);
  }
});

function appendChatMessage(role, text) {
  conversation.push({ role, content: text });
  const el = document.createElement("div");
  el.className = `chat-msg ${role}`;

  if (role === "assistant") {
    // Render assistant messages with simple formatting: convert bullets / numbered steps to lists
    el.innerHTML = convertTextToHtml(text);
  } else {
    // user messages remain plain text
    el.textContent = text;
  }

  chatWindow.appendChild(el);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function convertTextToHtml(text) {
  if (!text) return "";
  const escaped = escapeHtml(text);
  const lines = escaped.split(/\r?\n/).map((l) => l.trim());

  // Detect bullet lists (lines starting with '-' or '*')
  const isBulleted = lines.every((l) => l === "" || /^[-*]\s+/.test(l));
  if (isBulleted) {
    const items = lines
      .filter(Boolean)
      .map((l) => `<li>${l.replace(/^[-*]\s+/, "")}</li>`)
      .join("");
    return `<ul>${items}</ul>`;
  }

  // Detect numbered list (1., 2., etc.)
  const isNumbered = lines.every((l) => l === "" || /^\d+\.\s+/.test(l));
  if (isNumbered) {
    const items = lines
      .filter(Boolean)
      .map((l) => `<li>${l.replace(/^\d+\.\s+/, "")}</li>`)
      .join("");
    return `<ol>${items}</ol>`;
  }

  // Otherwise, convert paragraphs: double-newline -> paragraph, single newline -> <br>
  const paragraphs = [];
  let buffer = [];
  for (const line of lines) {
    if (line === "") {
      if (buffer.length) {
        paragraphs.push(buffer.join(" "));
        buffer = [];
      }
    } else {
      buffer.push(line);
    }
  }
  if (buffer.length) paragraphs.push(buffer.join(" "));

  return paragraphs.map((p) => `<p>${p.replace(/\s+/g, " ")}</p>`).join("");
}

async function callWorker(body) {
  if (!WORKER_URL)
    throw new Error(
      "WORKER_URL is not set. Deploy a Cloudflare Worker and set WORKER_URL in script.js."
    );
  try {
    // Send request to Cloudflare Worker following the provided pattern
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: conversation, ...body }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    // Try to extract assistant reply from several possible shapes
    let replyText = null;
    if (result.assistant) replyText = result.assistant;
    else if (result.choices && result.choices[0] && result.choices[0].message)
      replyText = result.choices[0].message.content;
    else if (result.message) replyText = result.message;
    else replyText = JSON.stringify(result);

    // Add the Worker's response to the conversation history and display it
    appendChatMessage("assistant", replyText);

    return { assistant: replyText };
  } catch (error) {
    console.error("Error calling worker:", error);
    appendChatMessage(
      "assistant",
      "Sorry, something went wrong. Please try again later."
    );
    throw error;
  }
}

async function sendChatToWorker(userText) {
  try {
    await callWorker({ type: "chat_message", message: userText });
  } catch (err) {
    appendChatMessage(
      "assistant",
      "Chat is not configured or an error occurred. Set WORKER_URL to enable AI responses."
    );
  }
}

// Clear Selections button handler (persistent)
if (clearSelectionsBtn) {
  clearSelectionsBtn.addEventListener("click", () => {
    if (!selectedProductIds.size) return;
    selectedProductIds.clear();
    saveSelections();
    renderProductsAndList();
    appendChatMessage("assistant", "Your selected products have been cleared.");
  });
}

/* Initialization */
(async function init() {
  allProducts = await loadProducts();
  loadSelections();
  renderProductsAndList();
})();
