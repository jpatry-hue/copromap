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
  const [filterOpen, setFilterOpen] = useState(​​​​​​​​​​​​​​​​
