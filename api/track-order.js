// /api/track-order.js

const ALLOWED_ORIGINS = ["https://coracao-confections-2.myshopify.com"];

function setCors(res, origin) {
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const isAllowed = ALLOWED_ORIGINS.includes(origin);

  // PRE-FLIGHT
  if (req.method === "OPTIONS") {
    if (isAllowed) setCors(res, origin);     // <- header'ı burada mutlaka dön
    return res.status(204).end();
  }

  // ORIGIN KONTROLÜ
  if (!isAllowed) {
    return res.status(403).json({ error: "Forbidden origin", origin });
  }

  // METHOD KONTROLÜ
  if (req.method !== "POST") {
    setCors(res, origin);
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ---- Buradan sonrası mevcut Shopify çağrın ----
  const { SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_API_TOKEN } = process.env;
  if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_API_TOKEN) {
    setCors(res, origin);
    return res.status(500).json({ error: "Missing Shopify env vars" });
  }

  try {
    const { orderNumber, email } = req.body || {};
    if (!orderNumber || !email) {
      setCors(res, origin);
      return res.status(400).json({ error: "Missing order number or email" });
    }

    const apiVersion = "2025-07";
    const qName = encodeURIComponent(orderNumber.toString().startsWith("#") ? orderNumber : `#${orderNumber}`);
    const qEmail = encodeURIComponent(email.trim());

    const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${apiVersion}/orders.json?name=${qName}&email=${qEmail}&status=any`;
    const r = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ADMIN_API_TOKEN,
        "Content-Type": "application/json",
        "Accept": "application/json"
      }
    });
    const text = await r.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { parseError: text }; }

    if (!r.ok) {
      setCors(res, origin);
      return res.status(r.status).json({ error: "Shopify error", detail: data || text });
    }
    if (!data.orders || data.orders.length === 0) {
      setCors(res, origin);
      return res.status(404).json({ error: "Order not found" });
    }

    const order = data.orders[0] || {};
    const f = Array.isArray(order.fulfillments) && order.fulfillments[0];
    const status = order.fulfillment_status || (f?.status || "unfulfilled");
    const tracking = f?.tracking_url || (f?.tracking_urls?.[0]) || "No tracking available";

    setCors(res, origin);
    return res.status(200).json({
      status: status || "unknown",
      tracking,
      order_name: order.name || null
    });
  } catch (err) {
    setCors(res, origin);
    return res.status(500).json({ error: "server_error", detail: String(err?.message || err) });
  }
}
