// /api/claude.js  — GEÇİCİ KOLAY ÇÖZÜM (CORS: *)
// Amaç: preflight'ın geçtiğini kanıtlamak. Çalıştıktan sonra listeye daraltacağız.

function setCorsAll(res) {
  res.setHeader("Access-Control-Allow-Origin", "*"); // geçici!
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
}

export default async function handler(req, res) {
  // 1) PRELIGHT: Tarayıcı önce hep OPTIONS atar
  if (req.method === "OPTIONS") {
    setCorsAll(res);
    return res.status(204).end(); // 204 No Content genelde daha temiz
  }

  // 2) SADECE POST'A İZİN
  if (req.method !== "POST") {
    setCorsAll(res);
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 3) ZORUNLU ENV
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    setCorsAll(res);
    return res.status(500).json({ error: "Missing ANTHROPIC_API_KEY" });
  }

  try {
    const {
      messages = [],
      system = "You are a helpful assistant.",
      model = "claude-3-sonnet-20240229",
      max_tokens = 800,
      temperature = 0.7,
    } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      setCorsAll(res);
      return res.status(400).json({ error: "messages array is required" });
    }

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model, max_tokens, temperature, system, messages }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      setCorsAll(res);
      return res.status(upstream.status).json({ error: "Anthropic error", detail });
    }

    const data = await upstream.json();
    setCorsAll(res);
    return res.status(200).json(data);
  } catch (e) {
    console.error(e);
    setCorsAll(res);
    return res.status(500).json({ error: "server_error" });
  }
}
