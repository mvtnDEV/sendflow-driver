'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { fetchDrivers, loginWithPinApi, vibrate } from '@/store'

const DRIVERS_CACHE_KEY = 'sf_drivers_cache'
const DRIVERS_TTL       = 1800000 // 30 min

function getCachedDrivers(): { id: string; name: string }[] | null {
  try {
    const raw = localStorage.getItem(DRIVERS_CACHE_KEY)
    if (!raw) return null
    const { data, timestamp } = JSON.parse(raw)
    if (Date.now() - timestamp > DRIVERS_TTL) return null
    return data
  } catch { return null }
}

function saveDriversCache(drivers: { id: string; name: string }[]) {
  try {
    localStorage.setItem(DRIVERS_CACHE_KEY, JSON.stringify({
      data: drivers, timestamp: Date.now(),
    }))
  } catch {}
}

export default function LoginPage() {
  const router  = useRouter()
  const [drivers,        setDrivers]        = useState<{ id: string; name: string }[]>([])
  const [selected,       setSelected]       = useState('')
  const [pin,            setPin]            = useState('')
  const [error,          setError]          = useState('')
  const [loading,        setLoading]        = useState(false)
  const [loadingDrivers, setLoadingDrivers] = useState(true)
  const [attempts,       setAttempts]       = useState(0)

  useEffect(() => {
    // Intentar caché primero para carga instantánea
    const cached = getCachedDrivers()
    if (cached && cached.length > 0) {
      setDrivers(cached)
      setSelected(cached[0].id)
      setLoadingDrivers(false)
    }

    // Siempre actualizar en background
    fetchDrivers().then(d => {
      if (d.length > 0) {
        setDrivers(d)
        setSelected(prev => prev || d[0].id)
        saveDriversCache(d)
      }
      setLoadingDrivers(false)
    })
  }, [])

  function pressDigit(d: string) {
    if (pin.length >= 4 || loading) return
    const next = pin + d
    setPin(next)
    setError('')
    vibrate(30)
    if (next.length === 4) setTimeout(() => tryLogin(next), 120)
  }

  async function tryLogin(code: string) {
    if (!selected) { setError('Selecciona un conductor'); setPin(''); return }
    setLoading(true)
    const result = await loginWithPinApi(selected, code)
    if (result) {
      vibrate(200)
      router.replace('/pedidos')
    } else {
      vibrate([50, 30, 50, 30, 50])
      const newAttempts = attempts + 1
      setAttempts(newAttempts)
      if (newAttempts >= 3) {
        setError(`PIN incorrecto (${newAttempts} intentos)`)
      } else {
        setError('PIN incorrecto')
      }
      setPin('')
      setLoading(false)
    }
  }

  function pressBack() {
    setPin(p => p.slice(0, -1))
    setError('')
    vibrate(20)
  }

  const KEYS = [['1','2','3'],['4','5','6'],['7','8','9'],['','0','⌫']]

  return (
    <div style={{ height:'100dvh', background:'linear-gradient(160deg, #0B1628 0%, #162544 100%)', display:'flex', flexDirection:'column', paddingTop:'calc(var(--sat) + 40px)', paddingBottom:'calc(var(--sab) + 24px)', paddingLeft:24, paddingRight:24 }}>

      {/* Logo */}
      <div style={{ textAlign:'center', marginBottom:40 }}>
        <div style={{ width:64, height:64, borderRadius:18, background:'linear-gradient(135deg, #2563EB, #1D4ED8)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px', boxShadow:'0 8px 24px rgba(37,99,235,.4)' }}>
          <svg width="34" height="34" viewBox="0 0 28 28" fill="none">
            <path d="M4 22V8l10 8 10-8v14" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div style={{ fontSize:24, fontWeight:700, color:'white', letterSpacing:'-0.5px' }}>Moovex</div>
        <div style={{ fontSize:13, color:'rgba(255,255,255,.45)', marginTop:4 }}>App del Conductor</div>
      </div>

      {/* Selector conductor */}
      <div style={{ marginBottom:28 }}>
        <div style={{ fontSize:11, color:'rgba(255,255,255,.5)', marginBottom:8, textTransform:'uppercase', letterSpacing:'.06em' }}>Conductor</div>
        {loadingDrivers && drivers.length === 0 ? (
          <div style={{ padding:14, background:'rgba(255,255,255,.08)', borderRadius:14, fontSize:14, color:'rgba(255,255,255,.5)', textAlign:'center' }}>
            Cargando conductores...
          </div>
        ) : drivers.length === 0 ? (
          <div style={{ padding:14, background:'rgba(255,59,48,.15)', borderRadius:14, fontSize:13, color:'#FF6B6B', textAlign:'center' }}>
            No hay conductores registrados. Créalos desde el sistema web.
          </div>
        ) : (
          <select
            value={selected}
            onChange={e => { setSelected(e.target.value); setPin(''); setError(''); setAttempts(0) }}
            style={{ width:'100%', padding:'14px 16px', background:'rgba(255,255,255,.08)', border:'1.5px solid rgba(255,255,255,.15)', borderRadius:14, fontSize:16, color:'white', outline:'none', fontFamily:'inherit', appearance:'none', WebkitAppearance:'none' }}>
            {drivers.map(d => (
              <option key={d.id} value={d.id} style={{ background:'#0B1628', color:'white' }}>{d.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* PIN dots */}
      <div style={{ textAlign:'center', marginBottom:24 }}>
        <div style={{ fontSize:13, color:'rgba(255,255,255,.5)', marginBottom:14, textTransform:'uppercase', letterSpacing:'.06em' }}>Ingresa tu PIN</div>
        <div style={{ display:'flex', justifyContent:'center', gap:16 }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{
              width:18, height:18, borderRadius:'50%',
              background: i < pin.length ? '#38BDF8' : 'rgba(255,255,255,.2)',
              transition: 'all .15s',
              transform:  i < pin.length ? 'scale(1.2)' : 'scale(1)',
              boxShadow:  i < pin.length ? '0 0 10px rgba(56,189,248,.5)' : 'none',
            }}/>
          ))}
        </div>
        {error && (
          <div style={{ marginTop:12, fontSize:14, color:'#F87171', fontWeight:500 }}>
            {error}
          </div>
        )}
        {loading && (
          <div style={{ marginTop:12, fontSize:13, color:'rgba(255,255,255,.4)' }}>
            Verificando...
          </div>
        )}
      </div>

      {/* Teclado */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, maxWidth:320, margin:'0 auto', width:'100%' }}>
        {KEYS.flat().map((key, i) => {
          if (key === '') return <div key={i}/>
          return (
            <button key={i}
              onClick={() => key === '⌫' ? pressBack() : pressDigit(key)}
              disabled={loading || drivers.length === 0}
              style={{
                height:70, borderRadius:16,
                fontSize:   key === '⌫' ? 22 : 26,
                fontWeight: 600,
                background: key === '⌫' ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.1)',
                border:     '1px solid rgba(255,255,255,.1)',
                color:      'white', cursor:'pointer',
                WebkitTapHighlightColor: 'transparent',
                transition: 'background .1s, transform .1s',
              }}
              onTouchStart={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,.22)'
                e.currentTarget.style.transform  = 'scale(0.95)'
              }}
              onTouchEnd={e => {
                e.currentTarget.style.background = key === '⌫' ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.1)'
                e.currentTarget.style.transform  = 'scale(1)'
              }}>
              {key}
            </button>
          )
        })}
      </div>
    </div>
  )
}
