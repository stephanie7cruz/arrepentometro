// Función serverless (Vercel). La API key vive en la variable de entorno GEMINI_API_KEY.
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ product: "Producto desconocido" });
  }

  try {
    const { image } = req.body || {};
    if (!image || typeof image !== "string" || image.length > 4_000_000) {
      return res.status(400).json({ product: "Producto desconocido" });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text:
                  "Mira la fotografía y nombra el objeto principal que aparece, como si fuera algo que alguien quiere comprar " +
                  "(una silla, una lámpara, unos zapatos, un celular, una planta, comida, ropa, etc.). " +
                  "Si el nombre exacto o la marca no son claros, usa un nombre genérico del tipo de objeto. " +
                  "Responde SOLO con el nombre corto en español (máximo 5 palabras), sin punto final ni explicaciones. " +
                  "Responde exactamente 'Producto desconocido' únicamente si la imagen está vacía, borrosa o no muestra ningún objeto.",
              },
              { inline_data: { mime_type: "image/jpeg", data: image } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 256,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (!r.ok) {
      const err = (await r.text()).slice(0, 300);
      console.error("Gemini error", r.status, err);
      return res.status(200).json({ product: "Producto desconocido", error: `${r.status} ${err}` });
    }

    const data = await r.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    let product = parts.map((p) => p.text || "").join("").trim();
    product = product.replace(/[.\n"]/g, "").slice(0, 60);
    if (!product) console.error("Gemini sin texto", JSON.stringify(data).slice(0, 300));
    return res.status(200).json({ product: product || "Producto desconocido", error: product ? undefined : "respuesta vacía" });
  } catch (e) {
    console.error("identify fallo", e);
    return res.status(200).json({ product: "Producto desconocido", error: String(e) });
  }
}
