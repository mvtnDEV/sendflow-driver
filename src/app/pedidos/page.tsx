'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  getDriverSession, clearDriverSession, fetchDriverOrders,
  STATUS_LABEL, STATUS_BG_FULL,
  type Order,
} from '@/store'

export default function PedidosPage() {
  const router = useRouter()
  const [driverName, setDriverName] = useState('')
  const [token,      setToken]      = useState('')
  const [orders,     setOrders]     = useState<Order[]>([])
  const [tab,        setTab]        = useState<'activos'|'entregados'>('activos')
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    const d = getDriverSession()
    if (!d) { router.replace('/login'); return }
    setDriverName(d.name)
    setToken(d.token)
    loadOrders(d.token)
  }, [])

  useEffect(() => {
    if (!token) return
    const t = setInterval(() => loadOrders(token), 30000)
    return () => clearInterval(t)
  }, [token])

  async function loadOrders(t: string) {
    const data = await fetchDriverOrders(t)
    setOrders(data)
    setLoading(false)
  }

  function logout() {
    if (!confirm('¿Cerrar sesión?')) return
    clearDriverSession()
    router.replace('/login')
  }

  const activos    = orders.filter(o => !['DELIVERED','CANCELLED'].includes(o.status))
  const entregados = orders.filter(o => o.status === 'DELIVERED')
  const displayed  = tab === 'activos' ? activos : entregados

  const stats = {
    total:     orders.length,
    delivered: entregados.length,
    inTransit: orders.filter(o => o.status === 'IN_TRANSIT').length,
    pending:   orders.filter(o => ['PENDING','RECEIVED'].includes(o.status)).length,
  }
  const pct = stats.total > 0 ? Math.round((stats.delivered / stats.total) * 100) : 0

  return (
    <div style={{ height:'100dvh', display:'flex', flexDirection:'column', background:'#F0F4F8', overflow:'hidden' }}>

      <div style={{ background:'#0B1628', paddingTop:'calc(var(--sat) + 16px)', paddingLeft:20, paddingRight:20, paddingBottom:16, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,.45)', textTransform:'uppercase', letterSpacing:'.06em' }}>Conductor</div>
            <div style={{ fontSize:18, fontWeight:700, color:'white', marginTop:2 }}>{driverName}</div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <Link href="/escanear" style={{ width:44, height:44, borderRadius:12, background:'#2563EB', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
                <rect x="7" y="7" width="10" height="10" rx="1"/>
              </svg>
            </Link>
            <button onClick={logout} style={{ width:44, height:44, borderRadius:12, background:'rgba(255,255,255,.08)', border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="2" strokeLinecap="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
              </svg>
            </button>
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
          {[
            { label:'Total',      value:stats.total,     color:'#38BDF8' },
            { label:'En ruta',    value:stats.inTransit, color:'#4ADE80' },
            { label:'Entregados', value:stats.delivered, color:'#A78BFA' },
            { label:'Pendientes', value:stats.pending,   color:'#FCD34D' },
          ].map(s => (
            <div key={s.label} style={{ background:'rgba(255,255,255,.07)', borderRadius:10, padding:'10px 8px', textAlign:'center' }}>
              <div style={{ fontSize:22, fontWeight:700, color:s.color }}>{s.value}</div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,.4)', marginTop:2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop:12 }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'rgba(255,255,255,.4)', marginBottom:5 }}>
            <span>Progreso del día</span>
            <span>{pct}% completado</span>
          </div>
          <div style={{ height:5, background:'rgba(255,255,255,.1)', borderRadius:3, overflow:'hidden' }}>
            <div style={{ width:`${pct}%`, height:'100%', background:'linear-gradient(90deg, #2563EB, #38BDF8)', borderRadius:3, transition:'width .4s' }}/>
          </div>
        </div>
      </div>

      <div style={{ display:'flex', background:'white', borderBottom:'1px solid #E2E8F0', flexShrink:0 }}>
        {([
          { key:'activos',    label:`Activos (${activos.length})` },
          { key:'entregados', label:`Entregados (${entregados.length})` },
        ] as {key:'activos'|'entregados';label:string}[]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ flex:1, padding:'13px 0', fontSize:14, fontWeight:500, background:'none', border:'none', cursor:'pointer', color:tab===t.key?'#2563EB':'#6B7280', borderBottom:`2px solid ${tab===t.key?'#2563EB':'transparent'}`, transition:'all .15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="scroll" style={{ flex:1, padding:'12px 16px', paddingBottom:'calc(var(--sab) + 12px)' }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:'60px 20px', color:'#9CA3AF' }}>
            <div style={{ fontSize:32, marginBottom:10 }}>⏳</div>
            <div style={{ fontSize:14 }}>Cargando pedidos...</div>
          </div>
        ) : displayed.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px 20px', color:'#9CA3AF' }}>
            <div style={{ fontSize:48, marginBottom:12 }}>{tab==='activos'?'📦':'✅'}</div>
            <div style={{ fontSize:16, fontWeight:500, color:'#374151', marginBottom:4 }}>
              {tab==='activos' ? 'Sin pedidos activos' : 'Aún no hay entregados'}
            </div>
            <div style={{ fontSize:13 }}>
              {tab==='activos' ? 'Los pedidos del día aparecerán aquí' : 'Los pedidos entregados aparecerán aquí'}
            </div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {displayed.map(o => {
              const sb = STATUS_BG_FULL[o.status]
              return (
                <Link key={o.id} href={`/pedidos/${o.id}`}
                  style={{ display:'block', background:'white', borderRadius:16, border:'1px solid #E2E8F0', overflow:'hidden', textDecoration:'none' }}>
                  <div style={{ height:4, background:sb.bg }}/>
                  <div style={{ padding:'14px 16px' }}>
                    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:8 }}>
                      <div>
                        <div style={{ fontFamily:'monospace', fontSize:15, fontWeight:700, color:'#1D4ED8', letterSpacing:'.5px' }}>{o.id}</div>
                        <div style={{ fontSize:12, color:'#9CA3AF', marginTop:1 }}>{o.orderNumber} · {o.storeName || o.store?.name}</div>
                      </div>
                      <span style={{ fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:20, background:sb.bg, color:sb.text, flexShrink:0, marginLeft:8 }}>
                        {STATUS_LABEL[o.status]}
                      </span>
                    </div>
                    <div style={{ fontSize:15, fontWeight:500, color:'#111', marginBottom:4 }}>{o.customerName}</div>
                    <div style={{ fontSize:13, color:'#6B7280', display:'flex', alignItems:'center', gap:5 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a7 7 0 0 0-7 7c0 4 7 13 7 13s7-9 7-13a7 7 0 0 0-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
                      {o.addressStreet}, {o.addressComuna}
                    </div>
                    <div style={{ display:'flex', gap:8, marginTop:10 }}>
                      <span style={{ fontSize:12, background:'#F1F5F9', color:'#475569', padding:'3px 10px', borderRadius:20 }}>
                        📦 {o.bultos} {o.bultos===1?'bulto':'bultos'}
                      </span>
                      {o.customerPhone && (
                        <a href={`tel:${o.customerPhone}`} onClick={e => e.stopPropagation()}
                          style={{ fontSize:12, background:'#F0FDF4', color:'#166534', padding:'3px 10px', borderRadius:20, textDecoration:'none' }}>
                          📞 {o.customerPhone}
                        </a>
                      )}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      <Link href="/escanear"
        style={{ position:'fixed', bottom:'calc(var(--sab) + 24px)', right:24, width:60, height:60, borderRadius:'50%', background:'#2563EB', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 20px rgba(37,99,235,.5)' }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
          <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
          <rect x="7" y="7" width="10" height="10" rx="1"/>
        </svg>
      </Link>
    </div>
  )
}
