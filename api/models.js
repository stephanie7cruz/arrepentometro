export default async function handler(req, res) {
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
    headers: { "x-goog-api-key": process.env.GEMINI_API_KEY },
  });
  const j = await r.json();
  const names = (j.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => m.name.replace("models/", ""));
  res.status(200).json({ status: r.status, names, error: j.error });
}
