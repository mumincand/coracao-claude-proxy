// /api/track-order.js

const ALLOWED_ORIGINS = [
  "https://www.coracaoconfections.com",
  "https://coracao-confections-2.myshopify.com", // gerekirse preview için
];

function setCors(res, origin) {
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const isAllowed = ALLOWED_ORIGINS.includes(origin);

  // Preflight
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

    // Versiyon: doğruladığımız stabil sürüm
    const apiVersion = "2024-10";

    // Shopify'da name genelde "#104349" formatında; # yoksa ekleyelim
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

    // 2) bulunamadıysa sadece email ile getirip name eşle
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
      // "Not Found" genelde versiyon/domain/token mismatch demektir; senin case'inde versiyonu düzelttik.
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
      order_name: order.name || null,
      status: status || "unknown",
      tracking,
    });

  } catch (err) {
    setCors(res, origin);
    return res.status(500).json({ error: "server_error", detail: String(err?.message || err) });
  }
}
