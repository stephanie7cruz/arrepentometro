// Función serverless (Vercel). La API key vive en la variable de entorno GEMINI_API_KEY.
// Cada modelo tiene su propia cuota gratuita: se prueban en orden hasta que uno responda.
const MODELS = (process.env.GEMINI_MODELS ||
  "gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.7-flash,gemini-3.8-flash").split(",");

const PROMPT =
  "Mira la fotografía y nombra el objeto principal que aparece, como si fuera algo que alguien quiere comprar " +
  "(una silla, una lámpara, unos zapatos, un celular, una planta, comida, ropa, etc.). " +
  "Si el nombre exacto o la marca no son claros, usa un nombre genérico del tipo de objeto. " +
  "Responde SOLO con el nombre corto en español (máximo 5 palabras), sin punto final ni explicaciones. " +
  "Responde exactamente 'Producto desconocido' únicamente si la imagen está vacía, borrosa o no muestra ningún objeto.";

async function ask(model, image, signal) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const r = await fetch(url, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: "image/jpeg", data: image } }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 256,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });
  if (!r.ok) throw new Error(`${model} ${r.status} ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p.text || "").join("").replace(/[.\n"]/g, "").trim().slice(0, 60);
  if (!text) throw new Error(`${model} respuesta vacía`);
  return text;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ product: "Producto desconocido" });
  }

  const { image } = req.body || {};
  if (!image || typeof image !== "string" || image.length > 4_000_000) {
    return res.status(400).json({ product: "Producto desconocido" });
  }

  // Reintentos: el modelo principal puede dar 503 por alta demanda.
  const deadline = Date.now() + 22000;
  let lastError = "";

  for (const model of MODELS) {
    const left = deadline - Date.now();
    if (left < 1500) break;
    try {
      const product = await ask(model, image, AbortSignal.timeout(Math.min(7000, left)));
      return res.status(200).json({ product });
    } catch (e) {
      lastError = String(e);
      console.error("identify intento fallido:", lastError);
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  return res.status(200).json({ product: "Producto desconocido", error: lastError });
}
