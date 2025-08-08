
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { orderNumber, email } = req.body;

  if (!orderNumber || !email) {
    return res.status(400).json({ error: "Missing order number or email" });
  }

  try {
    const response = await fetch(
      `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2025-01/orders.json?name=${encodeURIComponent(orderNumber)}&email=${encodeURIComponent(email)}`,
      {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API_TOKEN,
          "Content-Type": "application/json"
        }
      }
    );

    const data = await response.json();

    if (!data.orders || data.orders.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const order = data.orders[0];

    res.status(200).json({
      status: order.fulfillment_status || "Not fulfilled yet",
      tracking: order.fulfillments?.[0]?.tracking_url || "No tracking available"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}
