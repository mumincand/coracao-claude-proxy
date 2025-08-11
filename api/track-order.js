// /api/track-order.js

const ALLOWED_ORIGINS = [
  "https://www.coracaoconfections.com",
  "https://coracao-confections-2.myshopify.com", // preview gerekiyorsa bırak
];

function setCors(res, origin) {
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const isAllowed = ALLOWED_ORIGINS.includes(origin);

  // CORS preflight
  if (req.method === "OPTIONS") {
    if (isAllowed) setCors(res, origin);
    return res.status(204).end();
  }

  if (!isAllowed) {
    return res.status(403).json({ error: "Forbidden origin", origin });
  }

  if (req.method !== "POST") {
    setCors(res, origin);
    return res.status(405).json({ error: "Method not allowed" });
  }

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

    const apiVersion = "2024-10";
    const normalized = orderNumber.toString().startsWith("#")
      ? orderNumber.toString()
      : `#${orderNumber}`;

    const qName = encodeURIComponent(normalized);
    const qEmail = encodeURIComponent(email.trim());

    // 1) name + email ile dene
    const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${apiVersion}/orders.json?name=${qName}&email=${qEmail}&status=any`;
    let r = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ADMIN_API_TOKEN,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
    });

    let text = await r.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { parseError: text }; }

    // 2) bulunamazsa sadece email ile çekip name eşle
    if (r.ok && (!data.orders || data.orders.length === 0)) {
      const url2 = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${apiVersion}/orders.json?email=${qEmail}&status=any`;
      const r2 = await fetch(url2, {
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ADMIN_API_TOKEN,
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
      });
      const t2 = await r2.text();
      let d2; try { d2 = t2 ? JSON.parse(t2) : {}; } catch { d2 = { parseError: t2 }; }
      if (r2.ok && d2.orders?.length) {
        const normalizedNoHash = normalized.replace(/^#/, "");
        const match = d2.orders.find(o => (o.name || "").replace(/^#/, "") === normalizedNoHash);
        if (match) {
          data = { orders: [match] };
          r = r2;
        }
      }
    }

    if (!r.ok) {
      setCors(res, origin);
      return res.status(r.status).json({ error: "Shopify error", detail: data || text });
    }

    if (!data.orders || data.orders.length === 0) {
      setCors(res, origin);
      return res.status(404).json({ error: "Order not found" });
    }

    const order = data.orders[0] || {};
    const orderName = order.name || normalized; // "#104276"
    const statusRaw =
      order.fulfillment_status ||
      (Array.isArray(order.fulfillments) && order.fulfillments[0]?.status) ||
      "unfulfilled";

    const isFulfilled = String(statusRaw).toLowerCase() === "fulfilled";
    const statusUrl = order.order_status_url || null; // ✅ Shopify’nin verdiği doğru link
    const tracking =
      (Array.isArray(order.fulfillments) && (order.fulfillments[0]?.tracking_url || order.fulfillments[0]?.tracking_urls?.[0])) ||
      null;

    // ✨ İSTEDİĞİN MESAJ FORMATI
    const message = isFulfilled
      ? `Order ${orderName} was fulfilled.\n\nYou can view your full order details here: ${statusUrl || "https://www.coracaoconfections.com/pages/order-tracking"}\n\nIf you have additional questions about your order, feel free to message us.`
      : `Order ${orderName} has not been fulfilled yet.\n\nYou can view your full order details here: ${statusUrl || "https://www.coracaoconfections.com/pages/order-tracking"}\n\nIf you have additional questions about your order, feel free to message us.`;

    setCors(res, origin);
    return res.status(200).json({
      message,
      order_name: orderName.replace(/^#/, ""), // "104276"
      status: isFulfilled ? "fulfilled" : "unfulfilled",
      tracking: tracking || "No tracking available",
      status_url: statusUrl || null
    });

  } catch (err) {
    setCors(res, origin);
    return res.status(500).json({ error: "server_error", detail: String(err?.message || err) });
  }
}
