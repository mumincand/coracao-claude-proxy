// Güvenlik: sadece bu domainler izinli
const ALLOWED_ORIGINS = [
  "https://www.coracaoconfections.com",          // canlı domain
  "https://coracao-confections-2.myshopify.com"  // theme preview domain
];

// CORS header ekleme fonksiyonu
function setCors(res, origin) {
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const isAllowed = ALLOWED_ORIGINS.includes(origin);

  // 1) Preflight (OPTIONS) isteği
  if (req.method === "OPTIONS") {
    if (isAllowed) {
      setCors(res, origin); // Preflight’ta da header’ı döndür
    }
    return res.status(204).end(); // No Content
  }

  // 2) Origin kontrolü
  if (!isAllowed) {
    return res.status(403).json({ error: "Forbidden origin", origin });
  }

  // 3) Sadece POST’a izin ver
  if (req.method !== "POST") {
    setCors(res, origin);
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 4) API Key kontrolü
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    setCors(res, origin);
    return res.status(500).json({ error: "Missing ANTHROPIC_API_KEY" });
  }

  try {
    const {
      messages = [],
      system = "You are a helpful assistant.",
      model = "claude-3-sonnet-20240229",
      max_tokens = 800,
      temperature = 0.7
    } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      setCors(res, origin);
      return res.status(400).json({ error: "messages array is required" });
    }

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model,
        max_tokens,
        temperature,
        system,
        messages
      })
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      setCors(res, origin);
      return res.status(upstream.status).json({ error: "Anthropic error", detail });
    }

    const data = await upstream.json();
    setCors(res, origin);
    return res.status(200).json(data);

  } catch (err) {
    console.error(err);
    setCors(res, origin);
    return res.status(500).json({ error: "server_error" });
  }
}
