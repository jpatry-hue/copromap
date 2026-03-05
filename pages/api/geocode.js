export default async function handler(req, res) {
  const { q, limit = 5 } = req.query
  if (!q) return res.status(400).json({ error: 'q requis' })
  try {
    const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=${limit}`
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!response.ok) throw new Error(`BAN ${response.status}`)
    const data = await response.json()
    res.setHeader('Cache-Control', 's-maxage=3600')
    return res.status(200).json(data)
  } catch (err) {
    return res.status(502).json({ error: err.message, features: [] })
  }
}
