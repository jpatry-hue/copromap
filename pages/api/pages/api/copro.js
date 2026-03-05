export default async function handler(req, res) {
  const { lat, lon, distance = 500 } = req.query
  if (!lat || !lon) return res.status(400).json({ error: 'lat et lon requis' })
  try {
    const url = `https://registre.coproprietes.gouv.fr/api/coproprietes?lat=${lat}&lon=${lon}&distance=${distance}&limit=100`
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) throw new Error(`RNIC ${response.status}`)
    const data = await response.json()
    res.setHeader('Cache-Control', 's-maxage=300')
    return res.status(200).json({ source: 'rnic', results: data.results || data || [] })
  } catch (err) {
    return res.status(502).json({ error: err.message, results: [] })
  }
}
