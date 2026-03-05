export default async function handler(req, res) {
  const { lat, lon } = req.query
  if (!lat || !lon) return res.status(400).json({ error: 'lat et lon requis' })
  try {
    const [r1, r2] = await Promise.allSettled([
      fetch(`https://georisques.gouv.fr/api/v1/resultats_commune?latlon=${lon},${lat}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
      }),
      fetch(`https://georisques.gouv.fr/api/v1/radon?latlon=${lon},${lat}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000),
      }),
    ])
    let risques = {}
    let radon = null
    if (r1.status === 'fulfilled' && r1.value.ok) {
      const d = await r1.value.json()
      risques = d.data_risques_commune || d || {}
    }
    if (r2.status === 'fulfilled' && r2.value.ok) {
      const d = await r2.value.json()
      radon = d.classe_potentiel_radon || null
    }
    res.setHeader('Cache-Control', 's-maxage=86400')
    return res.status(200).json({ source: 'georisques', risques, radon })
  } catch (err) {
    return res.status(502).json({ error: err.message, risques: {} })
  }
}
