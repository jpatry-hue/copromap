export default async function handler(req, res) {
  const { lat, lon, distance = 500 } = req.query
  if (!lat || !lon) return res.status(400).json({ error: 'lat et lon requis' })
  try {
    const url = `https://api.dvf.etalab.gouv.fr/dvf/around/?lat=${lat}&lon=${lon}&dist=${distance}`
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) throw new Error(`DVF ${response.status}`)
    const data = await response.json()
    const features = (data.features || []).map(f => ({
      latitude: f.geometry?.coordinates?.[1],
      longitude: f.geometry?.coordinates?.[0],
      valeur_fonciere: parseFloat(f.properties?.valeur_fonciere) || 0,
      nature_mutation: f.properties?.nature_mutation || 'Vente',
      type_local: f.properties?.type_local || '—',
      surface_reelle_bati: parseFloat(f.properties?.surface_reelle_bati) || null,
      date_mutation: f.properties?.date_mutation || null,
      commune: f.properties?.commune || null,
    })).filter(f => f.latitude && f.longitude)
    res.setHeader('Cache-Control', 's-maxage=3600')
    return res.status(200).json({ source: 'dvf', count: features.length, results: features })
  } catch (err) {
    return res.status(502).json({ error: err.message, results: [] })
  }
}
