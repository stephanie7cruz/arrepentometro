// Función serverless (Vercel). La API key vive en la variable de entorno GEMINI_API_KEY.
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ product: "Producto desconocido" });
  }

  try {
    const { image } = req.body || {};
    if (!image || typeof image !== "string" || image.length > 4_000_000) {
      return res.status(400).json({ product: "Producto desconocido" });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text:
                  "Mira la fotografía e identifica el producto principal que alguien querría comprar. " +
                  "Responde SOLO con el nombre corto del producto en español (máximo 5 palabras), " +
                  "sin punto final ni explicaciones. Si no puedes identificar ningún producto responde exactamente: Producto desconocido",
              },
              { inline_data: { mime_type: "image/jpeg", data: image } },
            ],
          },
        ],
        generationConfig: { temperature: 0.2, maxOutputTokens: 30 },
      }),
    });

    if (!r.ok) return res.status(200).json({ product: "Producto desconocido" });

    const data = await r.json();
    let product = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    product = product.replace(/[.\n"]/g, "").slice(0, 60);
    return res.status(200).json({ product: product || "Producto desconocido" });
  } catch (e) {
    return res.status(200).json({ product: "Producto desconocido" });
  }
}
