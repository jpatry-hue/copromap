export default async function handler(req, res) {
  const { lat, lon, distance = 500 } = req.query
  if (!lat || !lon) return res.status(400).json({ error: 'lat et lon requis' })
  const latF = parseFloat(lat), lonF = parseFloat(lon)
  const d = parseFloat(distance) / 111320
  try {
    const url = `https://apicarto.ign.fr/api/gpu/acte-sup?geom=${encodeURIComponent(JSON.stringify({
      type:'Polygon',
      coordinates:[[[lonF-d,latF-d],[lonF+d,latF-d],[lonF+d,latF+d],[lonF-d,latF+d],[lonF-d,latF-d]]]
    }))}&_limit=50`
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) throw new Error(`Permis ${response.status}`)
    const data = await response.json()
    const results = (data.features || []).map(f => ({
      latitude: f.geometry?.coordinates?.[1],
      longitude: f.geometry?.coordinates?.[0],
      reference: f.properties?.numero || '—',
      type_autorisation: f.properties?.libelle_type || 'Permis de construire',
      statut: f.properties?.statut || 'Accordé',
      date_depot: f.properties?.date_depot || null,
      description: f.properties?.objet_travaux || '',
    })).filter(r => r.latitude && r.longitude)
    res.setHeader('Cache-Control', 's-maxage=3600')
    return res.status(200).json({ source: 'apicarto', count: results.length, results })
  } catch (err) {
    return res.status(502).json({ error: err.message, results: [] })
  }
}
