export default async function handler(req, res) {
  const { lat, lon, distance = 500 } = req.query
  if (!lat || !lon) return res.status(400).json({ error: 'lat et lon requis' })
  const d = parseFloat(distance) / 111320
  const latF = parseFloat(lat), lonF = parseFloat(lon)
  const bbox = `${lonF-d},${latF-d},${lonF+d},${latF+d}`
  try {
    const url = `https://data.ademe.fr/data-fair/api/v1/datasets/dpe-v2-logements-existants/lines?bbox=${bbox}&size=200&select=numero_dpe,classe_consommation_energie,classe_estimation_ges,conso_5_usages_e_finale,adresse_ban,date_etablissement_dpe,surface_habitable_logement,type_batiment,annee_construction`
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) throw new Error(`DPE ${response.status}`)
    const data = await response.json()
    const results = (data.results || []).map(r => ({
      latitude: r._geopoint?.lat || null,
      longitude: r._geopoint?.lon || null,
      classe: r.classe_consommation_energie,
      classe_ges: r.classe_estimation_ges,
      conso: r.conso_5_usages_e_finale,
      adresse: r.adresse_ban,
      date: r.date_etablissement_dpe,
      surface: r.surface_habitable_logement,
      type_batiment: r.type_batiment,
      annee: r.annee_construction,
    })).filter(r => r.latitude && r.longitude)
    res.setHeader('Cache-Control', 's-maxage=3600')
    return res.status(200).json({ source: 'ademe', count: results.length, results })
  } catch (err) {
    return res.status(502).json({ error: err.message, results: [] })
  }
}
