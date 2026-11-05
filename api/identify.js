// Función serverless (Vercel). La API key vive en la variable de entorno GEMINI_API_KEY.
// Cada modelo tiene su propia cuota gratuita: se prueban en orden hasta que uno responda.
const MODELS = (process.env.GEMINI_MODELS ||
  "gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.7-flash,gemini-3.8-flash").split(",");

const PROMPT =
  "Mira la fotografía y nombra el objeto principal que aparece, como si fuera algo que alguien quiere comprar " +
  "(una silla, una lámpara, unos zapatos, un celular, una planta, comida, ropa, etc.). " +
  "Si el nombre exacto o la marca no son claros, usa un nombre genérico del tipo de objeto. " +
  "Además escribe en phrase un texto en español para convencer a la persona de NO comprarlo, específico de ese objeto. " +
  "Formato: empieza con '¡No compres este/esta [objeto]!' y sigue con MÍNIMO 3 y máximo 5 preguntas que empiecen con '¿y si …?', " +
  "cada una con una falla o problema REAL y plausible de ese tipo de objeto (durabilidad, mal funcionamiento, incomodidad, " +
  "mancha, batería, sabor, talla, ruido, desconfiguración, malestar, etc.), contado de forma exagerada pero creíble. " +
  "Cierra con una pregunta corta que cuestione si vale la pena el riesgo. Máximo 480 caracteres en total. " +
  "Ejemplos de estilo: " +
  "agua: '¡No compres esta agua! ¿y si tiene un sabor extraño y no lo notas hasta tomarla? ¿y si contiene microplásticos? " +
  "¿y si tienes que ir al baño cinco veces y pierdes la tarde? ¿realmente quieres arriesgar tu tranquilidad por una botella?'; " +
  "zapatos: '¡No compres estos zapatos! ¿y si te aprietan a los diez minutos? ¿y si te salen ampollas y caminas como pingüino? " +
  "¿y si se despegan en plena calle? ¿realmente necesitas sufrir por verte bien?'. " +
  "Otros ejemplos de fallas: un esfero que se explota y mancha la camisa, un reloj que se descarga rápido, se daña pronto o se desconfigura. " +
  "Todo debe sonar a posibilidad (¿y si…?), sin insultos ni diagnósticos de enfermedades graves, y con humor. " +
  "Responde SOLO un JSON con las claves product (nombre corto, máximo 5 palabras, sin punto final) y phrase. " +
  "Si la imagen está vacía, borrosa o no muestra ningún objeto, usa product 'Producto desconocido' y phrase vacía.";

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
        temperature: 0.9,
        maxOutputTokens: 700,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });
  if (!r.ok) throw new Error(`${model} ${r.status} ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const raw = parts.map((p) => p.text || "").join("");
  let j;
  try { j = JSON.parse(raw); } catch { j = { product: raw }; }
  const clean = (v, n) => String(v || "").replace(/[\n"]/g, " ").trim().slice(0, n);
  const product = clean(j.product, 60).replace(/\.$/, "");
  if (!product) throw new Error(`${model} respuesta vacía`);
  return { product, phrase: clean(j.phrase, 600) };
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
  const errors = [];

  for (const model of MODELS) {
    const left = deadline - Date.now();
    if (left < 1500) break;
    try {
      const result = await ask(model, image, AbortSignal.timeout(Math.min(7000, left)));
      return res.status(200).json(result);
    } catch (e) {
      errors.push(String(e).slice(0, 160));
      console.error("identify intento fallido:", String(e));
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  return res.status(200).json({ product: "Producto desconocido", errors });
}
