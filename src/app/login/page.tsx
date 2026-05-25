'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { fetchDrivers, loginWithPinApi } from '@/store'

export default function LoginPage() {
  const router  = useRouter()
  const [drivers,  setDrivers]  = useState<{id:string;name:string}[]>([])
  const [selected, setSelected] = useState('')
  const [pin,      setPin]      = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [loadingDrivers, setLoadingDrivers] = useState(true)

  useEffect(() => {
    fetchDrivers().then(d => {
      setDrivers(d)
      if (d.length > 0) setSelected(d[0].id)
      setLoadingDrivers(false)
    })
  }, [])

  function pressDigit(d: string) {
    if (pin.length >= 4) return
    const next = pin + d
    setPin(next)
    setError('')
    if (next.length === 4) setTimeout(() => tryLogin(next), 120)
  }

  async function tryLogin(code: string) {
    if (!selected) { setError('Selecciona un conductor'); setPin(''); return }
    setLoading(true)
    const result = await loginWithPinApi(selected, code)
    if (result) {
      router.replace('/pedidos')
    } else {
      setError('PIN incorrecto')
      setPin('')
      setLoading(false)
    }
  }

  function pressBack() {
    setPin(p => p.slice(0, -1))
    setError('')
  }

  const KEYS = [['1','2','3'],['4','5','6'],['7','8','9'],['','0','⌫']]

  return (
    <div style={{ height:'100dvh', background:'linear-gradient(160deg, #0B1628 0%, #162544 100%)', display:'flex', flexDirection:'column', paddingTop:'calc(var(--sat) + 40px)', paddingBottom:'calc(var(--sab) + 24px)', paddingLeft:24, paddingRight:24 }}>

      {/* Header — logo y nombre */}
      <div style={{ textAlign:'center', marginBottom:40 }}>
        <div style={{ width:64, height:64, borderRadius:18, background:'#2563EB', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
          <svg width="34" height="34" viewBox="0 0 28 28" fill="none">
            <path d="M4 22V8l10 8 10-8v14" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div style={{ fontSize:24, fontWeight:700, color:'white', letterSpacing:'-0.5px' }}>Moovex</div>
        <div style={{ fontSize:13, color:'rgba(255,255,255,.45)', marginTop:4 }}>App del Conductor</div>
      </div>

      {/* Selector conductor */}
      <div style={{ marginBottom:28 }}>
        <div style={{ fontSize:12, color:'rgba(255,255,255,.5)', marginBottom:8, textTransform:'uppercase', letterSpacing:'.06em' }}>Conductor</div>
        {loadingDrivers ? (
          <div style={{ padding:14, background:'rgba(255,255,255,.08)', borderRadius:14, fontSize:14, color:'rgba(255,255,255,.5)', textAlign:'center' }}>
            Cargando conductores...
          </div>
        ) : drivers.length === 0 ? (
          <div style={{ padding:14, background:'rgba(255,59,48,.15)', borderRadius:14, fontSize:13, color:'#FF6B6B', textAlign:'center' }}>
            No hay conductores registrados. Créalos desde el sistema web.
          </div>
        ) : (
          <select value={selected} onChange={e => { setSelected(e.target.value); setPin(''); setError('') }}
            style={{ width:'100%', padding:'14px 16px', background:'rgba(255,255,255,.08)', border:'1.5px solid rgba(255,255,255,.15)', borderRadius:14, fontSize:16, color:'white', outline:'none', fontFamily:'inherit', appearance:'none' }}>
            {drivers.map(d => (
              <option key={d.id} value={d.id} style={{ background:'#0B1628', color:'white' }}>{d.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* PIN */}
      <div style={{ textAlign:'center', marginBottom:24 }}>
        <div style={{ fontSize:13, color:'rgba(255,255,255,.5)', marginBottom:14, textTransform:'uppercase', letterSpacing:'.06em' }}>Ingresa tu PIN</div>
        <div style={{ display:'flex', justifyContent:'center', gap:16 }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ width:18, height:18, borderRadius:'50%', background:i < pin.length ? '#38BDF8' : 'rgba(255,255,255,.2)', transition:'all .15s', transform:i < pin.length ? 'scale(1.15)' : 'scale(1)' }}/>
          ))}
        </div>
        {error && <div style={{ marginTop:12, fontSize:14, color:'#F87171', fontWeight:500 }}>{error}</div>}
      </div>

      {/* Teclado */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, maxWidth:320, margin:'0 auto', width:'100%' }}>
        {KEYS.flat().map((key, i) => {
          if (key === '') return <div key={i}/>
          return (
            <button key={i}
              onClick={() => key === '⌫' ? pressBack() : pressDigit(key)}
              disabled={loading || drivers.length === 0}
              style={{ height:70, borderRadius:16, fontSize:key==='⌫'?22:26, fontWeight:600, background:key==='⌫'?'rgba(255,255,255,.06)':'rgba(255,255,255,.1)', border:'1px solid rgba(255,255,255,.1)', color:'white', cursor:'pointer', WebkitTapHighlightColor:'transparent' }}
              onTouchStart={e => { e.currentTarget.style.background = 'rgba(255,255,255,.22)' }}
              onTouchEnd={e => { e.currentTarget.style.background = key==='⌫'?'rgba(255,255,255,.06)':'rgba(255,255,255,.1)' }}>
              {key}
            </button>
          )
        })}
      </div>
    </div>
  )
}
