import Head from 'next/head'
import { useEffect, useRef, useState, useCallback } from 'react'

function formatPrix(v) {
  if (!v) return '—'
  if (v >= 1000000) return `${(v/1000000).toFixed(2)}M€`
  if (v >= 1000) return `${Math.round(v/1000)}k€`
  return `${v}€`
}
function formatDate(s) {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'}) }
  catch { return s }
}
function getPeriode(y) {
  const n = parseInt(y)
  if (isNaN(n)) return '—'
  if (n < 1850) return 'Pré-haussmannien'
  if (n < 1914) return 'Haussmannien'
  if (n < 1945) return 'Entre-deux-guerres'
  if (n < 1960) return 'Reconstruction'
  if (n < 1975) return 'Trente Glorieuses'
  if (n < 1990) return 'Post-moderne'
  if (n < 2010) return 'Contemporain'
  return 'Récent'
}
const DPE_COLORS = {A:'#22c55e',B:'#86efac',C:'#fde047',D:'#fb923c',E:'#f87171',F:'#dc2626',G:'#991b1b'}
const DPE_LABELS = ['A','B','C','D','E','F','G']
const SOURCES = [
  {key:'copro',label:'Copropriétés',color:'#2563eb'},
  {key:'dvf',label:'DVF',color:'#34d399'},
  {key:'dpe',label:'DPE',color:'#fbbf24'},
  {key:'permis',label:'Permis',color:'#a78bfa'},
  {key:'risques',label:'Géorisques',color:'#f87171'},
]
const TABS = [
  {id:'identite',label:'🏢 Identité'},
  {id:'dvf',label:'💰 Mutations'},
  {id:'dpe',label:'⚡ DPE'},
  {id:'permis',label:'🏗️ Permis'},
  {id:'risques',label:'⚠️ Risques'},
]

export default function Home() {
  const mapRef = useRef(null)
  const leafletMap = useRef(null)
  const layerGroups = useRef({})
  const circleRef = useRef(null)
  const L = useRef(null)
  const suggestTimer = useRef(null)

  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showSugg, setShowSugg] = useState(false)
  const [toast, setToast] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const [loading, setLoading] = useState({})
  const [counts, setCounts] = useState({copro:null,dvf:null,dpe:null,permis:null,risques:null})
  const [activeLayers, setActiveLayers] = useState({copro:true,dvf:true,dpe:true,permis:true,risques:true})
  const [sheetOpen, setSheetOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('identite')
  const [selectedCopro, setSelectedCopro] = useState(null)
  const [allData, setAllData] = useState({copro:[],dvf:[],dpe:[],permis:[],risques:{}})
  const [filterOpen, setFilterOpen] = useState(false)
  const [radius, setRadius] = useState(500)

  useEffect(() => {
    if (typeof window === 'undefined' || leafletMap.current) return
    import('leaflet').then(leaflet => {
      L.current = leaflet.default
      delete L.current.Icon.Default.prototype._getIconUrl
      const map = L.current.map(mapRef.current, {
        center:[48.8566,2.3522], zoom:13,
        zoomControl:false, attributionControl:false,
      })
      L.current.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(map)
      leafletMap.current = map
      SOURCES.forEach(s => { layerGroups.current[s.key] = L.current.layerGroup().addTo(map) })
    })
    return () => { if (leafletMap.current) { leafletMap.current.remove(); leafletMap.current = null } }
  }, [])

  const showToast = useCallback((msg, ms=2500) => {
    setToast(msg); setToastVisible(true)
    setTimeout(() => setToastVisible(false), ms)
  }, [])

  useEffect(() => {
    clearTimeout(suggestTimer.current)
    if (query.length < 3) { setSuggestions([]); setShowSugg(false); return }
    suggestTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/geocode?q=${encodeURIComponent(query)}&limit=5`)
        const d = await r.json()
        setSuggestions(d.features || [])
        setShowSugg(true)
      } catch { setSuggestions([]) }
    }, 280)
  }, [query])

  async function doSearch() {
    setShowSugg(false)
    try {
      const r = await fetch(`/api/geocode?q=${encodeURIComponent(query)}&limit=1`)
      const d = await r.json()
      if (d.features?.length) {
        const [lon,lat] = d.features[0].geometry.coordinates
        flyAndLoad(lat, lon)
      } else showToast('⚠️ Adresse introuvable')
    } catch { showToast('⚠️ Erreur') }
  }

  function selectSugg(f) {
    setQuery(f.properties.label)
    setShowSugg(false)
    const [lon,lat] = f.geometry.coordinates
    flyAndLoad(lat, lon)
  }

  async function flyAndLoad(lat, lon) {
    if (!leafletMap.current || !L.current) return
    leafletMap.current.flyTo([lat,lon], 15, {duration:1.2})
    if (circleRef.current) leafletMap.current.removeLayer(circleRef.current)
    circleRef.current = L.current.circle([lat,lon], {
      radius, color:'rgba(37,99,235,0.5)',
      fillColor:'rgba(37,99,235,0.05)', fillOpacity:1,
      weight:1, dashArray:'4 4',
    }).addTo(leafletMap.current)
    SOURCES.forEach(s => layerGroups.current[s.key]?.clearLayers())
    setAllData({copro:[],dvf:[],dpe:[],permis:[],risques:{}})
    setCounts({copro:'…',dvf:'…',dpe:'…',permis:'…',risques:'…'})
    setLoading({copro:true,dvf:true,dpe:true,permis:true,risques:true})
    const p = `lat=${lat}&lon=${lon}&distance=${radius}`
    await Promise.all([
      loadSource('copro',`/api/copro?${p}`),
      loadSource('dvf',`/api/dvf?${p}`),
      loadSource('dpe',`/api/dpe?${p}`),
      loadSource('permis',`/api/permis?${p}`),
      loadSource('risques',`/api/georisques?lat=${lat}&lon=${lon}`),
    ])
    showToast('✅ Données chargées')
  }

  async function loadSource(name, url) {
    try {
      const r = await fetch(url)
      const d = await r.json()
      if (name === 'risques') {
        setAllData(prev => ({...prev, risques:d}))
        setCounts(prev => ({...prev, risques: Object.keys(d.risques||{}).length || '✓'}))
      } else {
        const items = d.results || []
        setAllData(prev => ({...prev, [name]:items}))
        setCounts(prev => ({...prev, [name]:items.length}))
        renderMarkers(name, items)
      }
    } catch {
      setCounts(prev => ({...prev, [name]:'⚠'}))
    } finally {
      setLoading(prev => ({...prev, [name]:false}))
    }
  }

  function renderMarkers(name, items) {
    if (!L.current || !layerGroups.current[name]) return
    const lg = layerGroups.current[name]
    lg.clearLayers()
    items.forEach(item => {
      const lat = item.latitude, lon = item.longitude
      if (!lat || !lon) return
      let html = ''
      if (name==='copro') {
        const lots = item.nb_lots_total || item.lots || '?'
        const sz = lots>100?28:lots>30?22:16
        html = `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:rgba(37,99,235,0.85);border:2px solid rgba(255,255,255,0.3);display:flex;align-items:center;justify-content:center;font-size:${sz<20?7:9}px;font-weight:800;color:#fff;box-shadow:0 0 ${sz/2}px rgba(37,99,235,0.5);cursor:pointer">${lots>99?'99+':lots}</div>`
      } else if (name==='dvf') {
        html = `<div style="width:14px;height:14px;border-radius:50%;background:rgba(52,211,153,0.75);border:2px solid rgba(52,211,153,0.3)"></div>`
      } else if (name==='dpe') {
        const cl = item.classe||'D'
        html = `<div style="width:14px;height:14px;border-radius:3px;background:${DPE_COLORS[cl]||'#999'};font-size:8px;font-weight:800;color:#000;display:flex;align-items:center;justify-content:center">${cl}</div>`
      } else if (name==='permis') {
        html = `<div style="width:14px;height:14px;background:rgba(167,139,250,0.8);border-radius:2px;transform:rotate(45deg)"></div>`
      }
      const icon = L.current.divIcon({className:'',iconSize:[14,14],iconAnchor:[7,7],html})
      const marker = L.current.marker([lat,lon],{icon}).addTo(lg)
      if (name==='copro') marker.on('click',()=>{setSelectedCopro(item);setActiveTab('identite');setSheetOpen(true)})
    })
  }

  function toggleLayer(name) {
    if (!leafletMap.current || !layerGroups.current[name]) return
    const lg = layerGroups.current[name]
    if (leafletMap.current.hasLayer(lg)) {
      leafletMap.current.removeLayer(lg)
      setActiveLayers(p=>({...p,[name]:false}))
    } else {
      lg.addTo(leafletMap.current)
      setActiveLayers(p=>({...p,[name]:true}))
    }
  }

  function locateMe() {
    if (!navigator.geolocation) { showToast('⚠️ Non supporté'); return }
    showToast('📍 Localisation…')
    navigator.geolocation.getCurrentPosition(
      pos => flyAndLoad(pos.coords.latitude, pos.coords.longitude),
      () => showToast('⚠️ Refusé')
    )
  }

  const c = selectedCopro
  const renderTabContent = () => {
    if (!c) return <div className="empty-state"><div className="emoji">👆</div><p>Cliquez sur une copropriété</p></div>
    switch(activeTab) {
      case 'identite': return <TabIdentite c={c}/>
      case 'dvf': return <TabDVF mutations={allData.dvf}/>
      case 'dpe': return <TabDPE c={c} dpeData={allData.dpe}/>
      case 'permis': return <TabPermis permis={allData.permis}/>
      case 'risques': return <TabRisques risques={allData.risques}/>
      default: return null
    }
  }

  return (
    <>
      <Head>
        <title>CoproMap</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover"/>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"/>
      </Head>
      <div ref={mapRef} style={{position:'fixed',inset:0,zIndex:1}}/>
      <div className="topbar">
        <div className="brand">
          <div className="brand-logo">🏢</div>
          <div className="brand-name">CoproMap</div>
          <div className="brand-sub">Data Gouv</div>
        </div>
        <div className="search-wrap">
          <span className="search-icon">🔍</span>
          <input className="search-input" type="text" placeholder="Rechercher une adresse…"
            value={query} onChange={e=>setQuery(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&doSearch()}
            autoComplete="off" autoCorrect="off" spellCheck={false}/>
          {showSugg && suggestions.length>0 && (
            <div className="suggestions">
              {suggestions.map((f,i)=>(
                <div key={i} className="suggestion-item" onClick={()=>selectSugg(f)}>
                  <strong>{f.properties.name||f.properties.label}</strong>
                  <span>{f.properties.postcode} {f.properties.city}</span>
                </div>
              ))}
            </div>
          )}
          <button className="search-btn" onClick={doSearch}>Chercher</button>
        </div>
      </div>
      <div className="sources">
        {SOURCES.map(s=>(
          <div key={s.key} className={`source-badge ${activeLayers[s.key]?'active':''}`} onClick={()=>toggleLayer(s.key)}>
            <div className="source-dot" style={{background:s.color}}/>
            <span>{s.label}</span>
            <span className="source-count">{loading[s.key]?'…':(counts[s.key]??'—')}</span>
          </div>
        ))}
      </div>
      <button className={`filter-btn ${filterOpen?'active':''}`} onClick={()=>setFilterOpen(!filterOpen)}>⚙️ Filtres</button>
      <button className="locate-btn" onClick={locateMe}>📍</button>
      <div className="radius-control">
        <span>Rayon</span>
        <input type="range" min={100} max={2000} step={100} value={radius} onChange={e=>setRadius(parseInt(e.target.value))}/>
        <span className="radius-val">{radius}m</span>
      </div>
      <div className={`toast ${toastVisible?'show':''}`}>{toast}</div>
      <div className={`sheet ${sheetOpen?'open':''}`}>
        <div className="sheet-handle" onClick={()=>setSheetOpen(!sheetOpen)}>
          <div className="sheet-handle-bar"/>
          <div className="sheet-header">
            <div className="copro-name">{c?(c.nom_syndic||c.adresse_principale||'Copropriété'):'Sélectionnez une copropriété'}</div>
            {c&&<div className="copro-address">{c.adresse||c.adresse_principale||''}</div>}
            {c&&(
              <div className="copro-badges">
                <span className="badge badge-blue">{c.nb_lots_total||c.lots||'—'} lots</span>
                <span className="badge badge-green">Construit {c.annee_construction||'—'}</span>
                {c.syndicat_pro&&<span className="badge badge-purple">Syndic Pro</span>}
              </div>
            )}
          </div>
        </div>
        <div className="sheet-tabs">
          {TABS.map(t=>(
            <div key={t.id} className={`tab ${activeTab===t.id?'active':''}`} onClick={()=>setActiveTab(t.id)}>{t.label}</div>
          ))}
        </div>
        <div className="sheet-content">{renderTabContent()}</div>
      </div>
      {filterOpen&&<div className="filter-overlay" onClick={()=>setFilterOpen(false)}/>}
      <div className={`filter-panel ${filterOpen?'open':''}`}>
        <div className="filter-header">
          <h3>⚙️ Filtres</h3>
          <button className="filter-close" onClick={()=>setFilterOpen(false)}>✕</button>
        </div>
        <div className="filter-content">
          <div className="filter-group">
            <div className="filter-group-title">Couches affichées</div>
            <div className="filter-chips">
              {SOURCES.map(s=>(
                <button key={s.key} className={`filter-chip ${activeLayers[s.key]?'active':''}`} onClick={()=>toggleLayer(s.key)}>{s.label}</button>
              ))}
            </div>
          </div>
        </div>
        <button className="apply-filters" onClick={()=>setFilterOpen(false)}>Appliquer</button>
      </div>
      <style jsx global>{`
        *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        :root{--bg:#060c1a;--surface:#0d1526;--surface2:#131f36;--border:rgba(255,255,255,0.08);--blue:#2563eb;--accent:#38bdf8;--success:#34d399;--warning:#fbbf24;--text:#e8eef8;--text-muted:#7a8ba8;--text-dim:#3d5070;--safe-top:env(safe-area-inset-top,0px);--safe-bottom:env(safe-area-inset-bottom,0px)}
        html,body{height:100dvh;overflow:hidden;background:var(--bg);color:var(--text);font-family:-apple-system,'SF Pro Display',sans-serif}
        .leaflet-tile-pane{filter:brightness(0.85) saturate(0.8) hue-rotate(200deg)}
        .leaflet-control-attribution,.leaflet-control-zoom{display:none}
        .topbar{position:fixed;top:0;left:0;right:0;z-index:1000;padding:calc(var(--safe-top) + 12px) 16px 12px;background:linear-gradient(to bottom,rgba(6,12,26,.98) 70%,transparent);display:flex;flex-direction:column;gap:10px}
        .brand{display:flex;align-items:center;gap:10px}
        .brand-logo{width:32px;height:32px;background:linear-gradient(135deg,#1a4fa8,var(--blue));border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px}
        .brand-name{font-size:18px;font-weight:700;background:linear-gradient(90deg,#fff,var(--accent));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
        .brand-sub{font-size:10px;color:var(--text-muted);letter-spacing:1.5px;text-transform:uppercase;margin-left:auto}
        .search-wrap{position:relative;display:flex;gap:8px}
        .search-icon{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--text-muted);font-size:14px;pointer-events:none;z-index:1}
        .search-input{flex:1;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:12px 16px 12px 42px;color:var(--text);font-size:15px;outline:none}
        .search-input::placeholder{color:var(--text-dim)}
        .search-input:focus{border-color:var(--blue);box-shadow:0 0 0 3px rgba(37,99,235,.2)}
        .search-btn{background:var(--blue);border:none;border-radius:14px;padding:0 16px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}
        .suggestions{position:absolute;top:calc(100% + 4px);left:0;right:58px;background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden;z-index:2000}
        .suggestion-item{padding:12px 16px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border)}
        .suggestion-item:last-child{border-bottom:none}
        .suggestion-item strong{display:block;color:var(--text)}
        .suggestion-item span{color:var(--text-muted);font-size:11px}
        .sources{position:fixed;top:160px;right:12px;z-index:500;display:flex;flex-direction:column;gap:6px}
        .source-badge{background:rgba(13,21,38,.92);border:1px solid var(--border);border-radius:20px;padding:5px 10px 5px 8px;display:flex;align-items:center;gap:6px;font-size:11px;font-weight:500;cursor:pointer;backdrop-filter:blur(8px)}
        .source-badge.active{border-color:var(--accent);background:rgba(56,189,248,.1)}
        .source-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
        .source-count{color:var(--accent);font-weight:700;font-size:12px;min-width:24px;text-align:right}
        .filter-btn{position:fixed;top:160px;left:12px;z-index:500;background:rgba(13,21,38,.92);border:1px solid var(--border);border-radius:14px;padding:8px 12px;color:var(--text);font-size:12px;font-weight:600;cursor:pointer;backdrop-filter:blur(8px)}
        .filter-btn.active{border-color:#a78bfa;color:#a78bfa}
        .locate-btn{position:fixed;bottom:260px;right:12px;z-index:500;width:42px;height:42px;background:rgba(13,21,38,.92);border:1px solid var(--border);border-radius:50%;color:var(--text);font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px)}
        .radius-control{position:fixed;bottom:260px;left:50%;transform:translateX(-50%);z-index:500;background:rgba(13,21,38,.92);border:1px solid var(--border);border-radius:20px;padding:8px 16px;display:flex;align-items:center;gap:10px;backdrop-filter:blur(8px);font-size:12px;color:var(--text-muted)}
        .radius-control input{-webkit-appearance:none;width:90px;height:3px;background:var(--surface2);border-radius:2px;outline:none}
        .radius-control input::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;background:var(--blue);border-radius:50%;cursor:pointer}
        .radius-val{color:var(--accent);font-weight:700;min-width:38px}
        .toast{position:fixed;top:130px;left:50%;transform:translateX(-50%) translateY(-16px);background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:8px 16px;font-size:12px;z-index:2000;opacity:0;transition:opacity .3s,transform .3s;white-space:nowrap;pointer-events:none}
        .toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
        .sheet{position:fixed;left:0;right:0;bottom:0;z-index:900;background:#0a1120;border-radius:20px 20px 0 0;border-top:1px solid var(--border);transform:translateY(100%);transition:transform .35s cubic-bezier(.32,.72,0,1);max-height:82dvh;display:flex;flex-direction:column;padding-bottom:var(--safe-bottom)}
        .sheet.open{transform:translateY(0)}
        .sheet-handle{display:flex;flex-direction:column;align-items:center;padding:12px 16px 8px;cursor:pointer;flex-shrink:0}
        .sheet-handle-bar{width:36px;height:4px;background:var(--text-dim);border-radius:2px;margin-bottom:10px}
        .sheet-header{width:100%}
        .copro-name{font-size:18px;font-weight:700}
        .copro-address{font-size:12px;color:var(--text-muted);margin-top:2px}
        .copro-badges{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
        .badge{padding:3px 8px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase}
        .badge-blue{background:rgba(37,99,235,.2);color:#60a5fa;border:1px solid rgba(37,99,235,.3)}
        .badge-green{background:rgba(52,211,153,.15);color:var(--success);border:1px solid rgba(52,211,153,.3)}
        .badge-purple{background:rgba(167,139,250,.15);color:#a78bfa;border:1px solid rgba(167,139,250,.3)}
        .sheet-tabs{display:flex;padding:0 16px;border-bottom:1px solid var(--border);overflow-x:auto;flex-shrink:0}
        .sheet-tabs::-webkit-scrollbar{display:none}
        .tab{padding:10px 14px;font-size:12px;font-weight:600;color:var(--text-muted);cursor:pointer;white-space:nowrap;border-bottom:2px solid transparent;transition:all .2s}
        .tab.active{color:var(--accent);border-bottom-color:var(--accent)}
        .sheet-content{flex:1;overflow-y:auto;padding:16px;-webkit-overflow-scrolling:touch}
        .data-section{margin-bottom:20px}
        .section-title{font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px;display:flex;align-items:center;gap:8px}
        .section-title::after{content:'';flex:1;height:1px;background:var(--border)}
        .data-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        .data-card{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px}
        .data-card.wide{grid-column:1 / -1}
        .data-label{font-size:10px;color:var(--text-muted);margin-bottom:4px;font-weight:500}
        .data-value{font-size:16px;font-weight:700}
        .data-value.big{font-size:22px}
        .data-value.accent{color:var(--accent)}
        .data-value.success{color:var(--success)}
        .data-sub{font-size:10px;color:var(--text-muted);margin-top:2px}
        .mutation-item{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center}
        .mutation-type{font-size:11px;font-weight:600;color:var(--text-muted)}
        .mutation-desc{font-size:13px;font-weight:600;margin:2px 0}
        .mutation-date{font-size:11px;color:var(--text-dim)}
        .mutation-price{font-size:16px;font-weight:800;color:var(--success)}
        .dpe-bar{display:flex;gap:2px;height:24px;margin:10px 0}
        .dpe-segment{flex:1;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;transition:transform .2s}
        .dpe-segment.active{transform:scaleY(1.3)}
        .risque-item{display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--surface);border-radius:8px;margin-bottom:6px;border-left:3px solid}
        .risque-name{font-size:13px;font-weight:600}
        .risque-level{font-size:11px;margin-top:2px}
        .permis-item{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px}
        .permis-ref{font-size:10px;color:var(--text-muted);font-family:monospace}
        .permis-type{font-size:13px;font-weight:600;margin:4px 0 2px}
        .permis-date{font-size:11px;color:var(--text-dim)}
        .permis-status{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;margin-top:6px}
        .filter-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1050;backdrop-filter:blur(2px)}
        .filter-panel{position:fixed;top:0;left:0;width:min(320px,90vw);height:100dvh;background:#0a1120;border-right:1px solid var(--border);z-index:1100;transform:translateX(-100%);transition:transform .3s cubic-bezier(.32,.72,0,1);display:flex;flex-direction:column;padding-top:var(--safe-top);padding-bottom:var(--safe-bottom)}
        .filter-panel.open{transform:translateX(0)}
        .filter-header{padding:20px 20px 12px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
        .filter-header h3{font-size:16px;font-weight:700}
        .filter-close{width:28px;height:28px;background:var(--surface2);border:none;border-radius:50%;color:var(--text);cursor:pointer;font-size:14px}
        .filter-content{flex:1;overflow-y:auto;padding:16px}
        .filter-group{margin-bottom:24px}
        .filter-group-title{font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-muted);margin-bottom:12px}
        .filter-chips{display:flex;flex-wrap:wrap;gap:6px}
        .filter-chip{padding:6px 12px;border-radius:20px;font-size:12px;font-weight:600;border:1px solid var(--border);background:transparent;color:var(--text-muted);cursor:pointer}
        .filter-chip.active{background:var(--blue);border-color:var(--blue);color:#fff}
        .apply-filters{margin:16px;padding:14px;background:var(--blue);border:none;border-radius:14px;color:#fff;font-size:15px;font-weight:700;width:calc(100% - 32px);cursor:pointer}
        .empty-state{text-align:center;padding:30px 20px;color:var(--text-muted)}
        .emoji{font-size:32px;margin-bottom:8px}
        .empty-state p{font-size:13px;line-height:1.5}
        .mono{font-family:'SF Mono',monospace}
      `}</style>
    </>
  )
}

function TabIdentite({c}) {
  return (
    <div>
      <div className="data-section">
        <div className="section-title">Identification</div>
        <div className="data-grid">
          <div className="data-card wide">
            <div className="data-label">N° Immatriculation RNIC</div>
            <div className="data-value accent mono" style={{fontSize:13}}>{c.numero_immatriculation||'—'}</div>
            <div className="data-sub">Enregistré le {formatDate(c.date_immatriculation)}</div>
          </div>
          <div className="data-card">
            <div className="data-label">Commune</div>
            <div className="data-value" style={{fontSize:14}}>{c.commune||'—'}</div>
            <div className="data-sub">{c.code_postal}</div>
          </div>
          <div className="data-card">
            <div className="data-label">Régime</div>
            <div className="data-value" style={{fontSize:12,lineHeight:1.3}}>{c.regime_juridique||'Copropriété'}</div>
          </div>
        </div>
      </div>
      <div className="data-section">
        <div className="section-title">Composition</div>
        <div className="data-grid">
          <div className="data-card"><div className="data-label">Total lots</div><div className="data-value big accent">{c.nb_lots_total||c.lots||'—'}</div></div>
          <div className="data-card"><div className="data-label">Habitation</div><div className="data-value">{c.nb_lots_habitation||'—'}</div></div>
          <div className="data-card"><div className="data-label">Activité</div><div className="data-value">{c.nb_lots_activite||'—'}</div></div>
          <div className="data-card"><div className="data-label">Stationnement</div><div className="data-value">{c.nb_lots_stationnement||'—'}</div></div>
          <div className="data-card"><div className="data-label">Surface</div><div className="data-value">{c.surface_totale?`${c.surface_totale} m²`:'—'}</div></div>
          <div className="data-card"><div className="data-label">Étages</div><div className="data-value">{c.nombre_etages||'—'}</div></div>
        </div>
      </div>
      <div className="data-section">
        <div className="section-title">Construction</div>
        <div className="data-grid">
          <div className="data-card"><div className="data-label">Année</div><div className="data-value">{c.annee_construction||'—'}</div></div>
          <div className="data-card"><div className="data-label">Période</div><div className="data-value" style={{fontSize:12}}>{getPeriode(c.annee_construction)}</div></div>
        </div>
      </div>
      <div className="data-section">
        <div className="section-title">Syndic</div>
        <div className="data-card wide">
          <div className="data-label">Syndic gestionnaire</div>
          <div className="data-value" style={{fontSize:15,margin:'4px 0'}}>{c.nom_syndic||'—'}</div>
          {c.siren_syndic&&<div className="data-sub mono">SIREN : {c.siren_syndic}</div>}
        </div>
      </div>
    </div>
  )
}

function TabDVF({mutations}) {
  if (!mutations?.length) return <div className="empty-state"><div className="emoji">💰</div><p>Aucune mutation DVF<br/>dans ce périmètre</p></div>
  const sorted = [...mutations].sort((a,b)=>new Date(b.date_mutation||0)-new Date(a.date_mutation||0))
  const total = mutations.reduce((s,m)=>s+(m.valeur_fonciere||0),0)
  return (
    <div>
      <div className="data-section">
        <div className="section-title">Statistiques</div>
        <div className="data-grid">
          <div className="data-card"><div className="data-label">Transactions</div><div className="data-value big accent">{mutations.length}</div></div>
          <div className="data-card"><div className="data-label">Prix moyen</div><div className="data-value success" style={{fontSize:14}}>{formatPrix(Math.round(total/mutations.length))}</div></div>
        </div>
      </div>
      <div className="data-section">
        <div className="section-title">Dernières mutations</div>
        {sorted.slice(0,15).map((m,i)=>(
          <div key={i} className="mutation-item">
            <div style={{flex:1}}>
              <div className="mutation-type">{m.nature_mutation||'Vente'}</div>
              <div className="mutation-desc">{m.type_local||'—'}{m.surface_reelle_bati?` · ${m.surface_reelle_bati}m²`:''}</div>
              <div className="mutation-date">{formatDate(m.date_mutation)}</div>
            </div>
            <div className="mutation-price">{formatPrix(m.valeur_fonciere)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TabDPE({c, dpeData}) {
  const classe = c.dpe_classe||'D'
  const classeColor = DPE_COLORS[classe]||'#999'
  return (
    <div>
      <div className="data-section">
        <div className="section-title">Classe énergétique</div>
        <div className="data-card wide">
          <div style={{display:'flex',alignItems:'baseline',gap:8,marginTop:4,marginBottom:14}}>
            <div style={{fontSize:48,fontWeight:900,color:classeColor,lineHeight:1}}>{classe}</div>
            <div style={{color:'#7a8ba8',fontSize:13}}>{c.dpe_conso||'—'} kWh/m²/an</div>
          </div>
          <div className="dpe-bar">
            {DPE_LABELS.map(s=>(
              <div key={s} className={`dpe-segment ${s===classe?'active':''}`}
                style={{background:DPE_COLORS[s],opacity:s===classe?1:0.3,color:s===classe?'#000':'transparent'}}>
                {s}
              </div>
            ))}
          </div>
        </div>
      </div>
      {dpeData?.length>0&&(
        <div className="data-section">
          <div className="section-title">Distribution secteur ({dpeData.length} DPE)</div>
          <div className="data-grid">
            {DPE_LABELS.map(s=>{
              const count = dpeData.filter(d=>d.classe===s).length
              const pct = dpeData.length?Math.round(count/dpeData.length*100):0
              return (
                <div key={s} className="data-card" style={{borderColor:DPE_COLORS[s]+'40'}}>
                  <div style={{display:'flex',justifyContent:'space-between'}}>
                    <div style={{fontSize:20,fontWeight:800,color:DPE_COLORS[s]}}>{s}</div>
                    <div style={{fontSize:16,fontWeight:700}}>{count}</div>
                  </div>
                  <div style={{background:'#131f36',borderRadius:2,height:3,marginTop:6}}>
                    <div style={{background:DPE_COLORS[s],height:'100%',borderRadius:2,width:`${pct}%`}}/>
                  </div>
                  <div className="data-sub">{pct}%</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function TabPermis({permis}) {
  if (!permis?.length) return <div className="empty-state"><div className="emoji">🏗️</div><p>Aucun permis trouvé<br/>dans ce périmètre</p></div>
  const statusStyles = {'Accordé':{bg:'rgba(52,211,153,.15)',color:'#34d399'},'Refusé':{bg:'rgba(248,113,113,.15)',color:'#f87171'},'En cours':{bg:'rgba(251,191,36,.15)',color:'#fbbf24'}}
  return (
    <div className="data-section">
      <div className="section-title">{permis.length} autorisations</div>
      {permis.map((p,i)=>{
        const ss = statusStyles[p.statut]||statusStyles['En cours']
        return (
          <div key={i} className="permis-item">
            <div className="permis-ref">{p.reference||'—'}</div>
            <div className="permis-type">{p.type_autorisation||'Permis de construire'}</div>
            <div className="permis-date">Déposé le {formatDate(p.date_depot)}</div>
            {p.description&&<div style={{fontSize:11,color:'#7a8ba8',marginTop:4}}>{p.description}</div>}
            <div className="permis-status" style={{background:ss.bg,color:ss.color}}>{p.statut||'En cours'}</div>
          </div>
        )
      })}
    </div>
  )
}

function TabRisques({risques}) {
  if (!risques||!Object.keys(risques).length) return <div className="empty-state"><div className="emoji">✅</div><p>Aucune donnée disponible</p></div>
  const RISQUES_DEF = [
    {key:'inondation',icon:'🌊',label:'Inondation',color:'#38bdf8'},
    {key:'seisme',icon:'🏔️',label:'Séisme',color:'#f97316'},
    {key:'mouvements_terrain',icon:'⛰️',label:'Mouvements de terrain',color:'#a78bfa'},
    {key:'radon',icon:'☢️',label:'Radon',color:'#fbbf24'},
    {key:'argiles',icon:'🟫',label:'Retrait-gonflement argiles',color:'#d97706'},
    {key:'industriel',icon:'🏭',label:'Risque industriel',color:'#ef4444'},
    {key:'minier',icon:'⛏️',label:'Risque minier',color:'#6b7280'},
  ]
  const data = risques.risques||risques
  return (
    <div className="data-section">
      <div className="section-title">Analyse géorisques</div>
      {RISQUES_DEF.map(r=>{
        const d = data[r.key]||{}
        const present = d.present??false
        const niveau = d.niveau||(present?'Présent':'Non concerné')
        return (
          <div key={r.key} className="risque-item" style={{borderLeftColor:present?r.color:'#1e3a5f'}}>
            <div style={{fontSize:18}}>{r.icon}</div>
            <div style={{flex:1}}>
              <div className="risque-name">{r.label}</div>
              <div className="risque-level" style={{color:present?'#fbbf24':'#34d399'}}>{niveau}</div>
            </div>
            <div>{present?'⚠️':'✅'}</div>
          </div>
        )
      })}
    </div>
  )
}
