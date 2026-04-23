'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  getDriverSession, getOrderById, driverUpdateStatus, driverSaveEvidence,
  STATUS_LABEL, STATUS_BG_FULL, STATUS_COLOR,
  type Driver, type Order, type OrderStatus, type DeliveryEvidence,
} from '@/store'

const ACTIONS: Record<OrderStatus, { status: OrderStatus; label: string; icon: string; primary?: boolean }[]> = {
  PENDING:    [{ status:'RECEIVED',   label:'Recepcionar en bodega', icon:'📥', primary:true }],
  RECEIVED:   [{ status:'IN_TRANSIT', label:'Salir a entregar',      icon:'🚚', primary:true }],
  IN_TRANSIT: [
    { status:'DELIVERED', label:'Marcar como entregado', icon:'✅', primary:true },
    { status:'INCIDENT',  label:'Reportar incidencia',   icon:'⚠️' },
  ],
  INCIDENT:   [{ status:'IN_TRANSIT', label:'Reintentar entrega',   icon:'🔄', primary:true }],
  DELIVERED:  [],
  CANCELLED:  [],
}

export default function PedidoDetailPage({ params }: { params: { id: string } }) {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const wasScanned   = searchParams.get('scanned') === '1'

  const [driver,      setDriver]      = useState<Driver | null>(null)
  const [order,       setOrder]       = useState<Order | null>(null)
  const [note,        setNote]        = useState('')
  const [showEv,      setShowEv]      = useState(false)
  const [evNote,      setEvNote]      = useState('')
  const [photo1,      setPhoto1]      = useState('')
  const [photo2,      setPhoto2]      = useState('')
  const [saving,      setSaving]      = useState(false)
  const [justScanned, setJustScanned] = useState(wasScanned)
  const ref1 = useRef<HTMLInputElement>(null)
  const ref2 = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const d = getDriverSession()
    if (!d) { router.replace('/login'); return }
    setDriver(d)

    const o = getOrderById(params.id)
    if (!o) { router.replace('/pedidos'); return }
    setOrder(o)

    if (wasScanned) setTimeout(() => setJustScanned(false), 3000)
  }, [params.id])

  function doAction(status: OrderStatus) {
    if (status === 'DELIVERED') { setShowEv(true); return }
    if (!driver || !order) return
    const updated = driverUpdateStatus(order.id, status, driver.id, driver.name, note || undefined)
    if (updated) { setOrder(updated); setNote('') }
  }

  function loadPhoto(e: React.ChangeEvent<HTMLInputElement>, slot: 1 | 2) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { alert('Imagen max 5MB'); return }
    const r = new FileReader()
    r.onload = ev => slot === 1 ? setPhoto1(ev.target?.result as string) : setPhoto2(ev.target?.result as string)
    r.readAsDataURL(file)
  }

  function handleSaveEvidence() {
    if (!photo1) { alert('Agrega al menos una foto'); return }
    if (!driver || !order) return
    setSaving(true)
    const ev: DeliveryEvidence = { photo1, photo2, note: evNote, capturedAt: new Date().toISOString() }
    driverSaveEvidence(order.id, ev)
    const updated = driverUpdateStatus(order.id, 'DELIVERED', driver.id, driver.name, note || 'Entregado con evidencia fotográfica')
    if (updated) setOrder({ ...updated, evidence: ev })
    setShowEv(false)
    setSaving(false)
  }

  function callCustomer() {
    if (order?.customerPhone) window.location.href = `tel:${order.customerPhone}`
  }

  function openMaps() {
    if (!order) return
    const address = encodeURIComponent(`${order.addressStreet}, ${order.addressComuna}, ${order.addressRegion}, Chile`)
    window.open(`https://maps.google.com/maps?q=${address}`, '_blank')
  }

  function openWaze() {
    if (!order) return
    const address = encodeURIComponent(`${order.addressStreet}, ${order.addressComuna}, Chile`)
    window.open(`https://waze.com/ul?q=${address}&navigate=yes`, '_blank')
  }

  if (!order || !driver) return null

  const actions = ACTIONS[order.status] ?? []
  const sb      = STATUS_BG_FULL[order.status]

  return (
    <div style={{ height:'100dvh', display:'flex', flexDirection:'column', background:'#F0F4F8', overflow:'hidden' }}>

      {/* ── Header de color ── */}
      <div style={{
        background: sb.bg,
        paddingTop: 'calc(var(--sat) + 14px)',
        paddingBottom: 18, paddingLeft: 20, paddingRight: 20,
        flexShrink: 0,
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
          <button onClick={() => router.back()}
            style={{ width:38, height:38, borderRadius:'50%', background:'rgba(255,255,255,.25)', border:'none', color:'white', fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            ←
          </button>
          <div style={{ flex:1 }}>
            <div style={{ fontFamily:'monospace', fontSize:17, fontWeight:700, color:'white', letterSpacing:'1px' }}>{order.id}</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,.7)', marginTop:1 }}>{order.orderNumber}</div>
          </div>
          <span style={{ fontSize:12, fontWeight:600, padding:'5px 12px', borderRadius:20, background:'rgba(255,255,255,.25)', color:'white' }}>
            {STATUS_LABEL[order.status]}
          </span>
        </div>

        {justScanned && (
          <div style={{ background:'rgba(255,255,255,.2)', borderRadius:10, padding:'8px 14px', fontSize:13, color:'white', textAlign:'center', marginBottom:4 }}>
            ✓ QR escaneado correctamente
          </div>
        )}
      </div>

      {/* ── Contenido scrollable ── */}
      <div className="scroll" style={{ flex:1, paddingBottom:'calc(var(--sab) + 100px)' }}>

        {/* Datos del cliente */}
        <div className="card" style={{ margin:'12px 16px 0', padding:'16px' }}>
          <div style={{ fontSize:11, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:10 }}>Destinatario</div>

          <div style={{ fontSize:18, fontWeight:600, marginBottom:6 }}>{order.customerName}</div>

          {/* Dirección + navegación */}
          <div style={{ fontSize:14, color:'#374151', marginBottom:12, lineHeight:1.5 }}>
            📍 {order.addressStreet}<br/>
            <span style={{ color:'#6B7280' }}>{order.addressComuna}, {order.addressRegion}</span>
          </div>
          {order.addressNotes && (
            <div style={{ fontSize:13, color:'#6B7280', background:'#F8FAFC', borderRadius:8, padding:'8px 12px', marginBottom:12, fontStyle:'italic' }}>
              "{order.addressNotes}"
            </div>
          )}

          {/* Botones de acción rápida */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
            {order.customerPhone && (
              <button onClick={callCustomer}
                style={{ padding:'10px 8px', background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:12, fontSize:12, color:'#166534', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                <span style={{ fontSize:20 }}>📞</span>
                Llamar
              </button>
            )}
            <button onClick={openMaps}
              style={{ padding:'10px 8px', background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:12, fontSize:12, color:'#1D4ED8', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
              <span style={{ fontSize:20 }}>🗺</span>
              Maps
            </button>
            <button onClick={openWaze}
              style={{ padding:'10px 8px', background:'#FFF7ED', border:'1px solid #FED7AA', borderRadius:12, fontSize:12, color:'#C2410C', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
              <span style={{ fontSize:20 }}>🚗</span>
              Waze
            </button>
          </div>
        </div>

        {/* Datos del pedido */}
        <div className="card" style={{ margin:'12px 16px 0', padding:'16px' }}>
          <div style={{ fontSize:11, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:10 }}>Datos del envío</div>
          {[
            ['Tienda',    order.storeName],
            ['Bultos',    `${order.bultos} ${order.bultos===1?'bulto':'bultos'}`],
            ['Peso',      order.weightKg ? `${order.weightKg} kg` : '—'],
            ['Creado',    new Date(order.createdAt).toLocaleString('es-CL',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})],
          ].map(([k,v]) => (
            <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid #F1F5F9', fontSize:14 }}>
              <span style={{ color:'#6B7280' }}>{k}</span>
              <span style={{ fontWeight:500 }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Evidencia (si existe) */}
        {order.evidence && (
          <div className="card" style={{ margin:'12px 16px 0', padding:'16px', border:'1px solid #BBF7D0' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <div style={{ fontSize:11, color:'#166534', textTransform:'uppercase', letterSpacing:'.05em' }}>📷 Evidencia guardada</div>
              <span style={{ fontSize:11, color:'#6B7280' }}>{new Date(order.evidence.capturedAt).toLocaleString('es-CL',{hour:'2-digit',minute:'2-digit'})}</span>
            </div>
            <div style={{ display:'grid', gridTemplateColumns: order.evidence.photo2 ? '1fr 1fr' : '1fr', gap:8 }}>
              <img src={order.evidence.photo1} alt="Foto 1" onClick={() => window.open(order.evidence!.photo1,'_blank')}
                style={{ width:'100%', borderRadius:8, maxHeight:120, objectFit:'cover', cursor:'pointer' }}/>
              {order.evidence.photo2 && (
                <img src={order.evidence.photo2} alt="Foto 2" onClick={() => window.open(order.evidence!.photo2,'_blank')}
                  style={{ width:'100%', borderRadius:8, maxHeight:120, objectFit:'cover', cursor:'pointer' }}/>
              )}
            </div>
            {order.evidence.note && (
              <div style={{ marginTop:8, fontSize:13, color:'#166534', fontStyle:'italic' }}>"{order.evidence.note}"</div>
            )}
          </div>
        )}

        {/* Timeline */}
        <div className="card" style={{ margin:'12px 16px 0', padding:'16px' }}>
          <div style={{ fontSize:11, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:12 }}>Historial</div>
          <div style={{ position:'relative', paddingLeft:20 }}>
            <div style={{ position:'absolute', left:6, top:0, bottom:0, width:1, background:'#E2E8F0' }}/>
            {order.events.map((ev,i) => {
              const isLast = i === order.events.length - 1
              const evSc   = STATUS_COLOR[ev.status]
              return (
                <div key={i} style={{ position:'relative', paddingBottom:isLast?0:14 }}>
                  <div style={{ position:'absolute', left:-17, top:2, width:13, height:13, borderRadius:'50%',
                    background: isLast ? evSc.color : '#2563EB', border:`2px solid ${isLast ? evSc.color : '#2563EB'}`, zIndex:1 }}>
                    {!isLast && <svg style={{display:'block',margin:'auto',marginTop:1}} width="7" height="7" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2.5"><polyline points="1 5 4 8 9 2"/></svg>}
                  </div>
                  <div style={{ fontSize:13, fontWeight:500 }}>{STATUS_LABEL[ev.status]}</div>
                  <div style={{ fontSize:12, color:'#6B7280', marginTop:1 }}>{ev.note}</div>
                  <div style={{ fontSize:11, color:'#9CA3AF', marginTop:1 }}>{new Date(ev.createdAt).toLocaleString('es-CL',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Acciones fijas en el footer ── */}
      {actions.length > 0 && (
        <div style={{
          position:'fixed', bottom:0, left:0, right:0,
          background:'white', borderTop:'1px solid #E2E8F0',
          padding:`16px 16px calc(var(--sab) + 16px)`,
          flexShrink:0,
        }}>
          <input value={note} onChange={e=>setNote(e.target.value)} placeholder="Nota opcional..."
            style={{ width:'100%', padding:'10px 14px', border:'1px solid #E2E8F0', borderRadius:10, fontSize:14, outline:'none', marginBottom:10, fontFamily:'inherit' }}/>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {actions.map(a => (
              <button key={a.status} onClick={() => doAction(a.status)}
                className={`btn ${a.primary ? 'btn-primary' : 'btn-outline'}`}>
                <span style={{ fontSize:18 }}>{a.icon}</span>
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {order.status === 'DELIVERED' && (
        <div style={{
          position:'fixed', bottom:0, left:0, right:0,
          background:'#F0FDF4', borderTop:'1px solid #BBF7D0',
          padding:`14px 16px calc(var(--sab) + 14px)`,
          textAlign:'center',
        }}>
          <div style={{ fontSize:16, fontWeight:600, color:'#166534' }}>
            ✅ Pedido entregado — {new Date(order.deliveredAt).toLocaleString('es-CL',{hour:'2-digit',minute:'2-digit'})}
          </div>
          {!order.evidence && (
            <button onClick={() => setShowEv(true)}
              style={{ marginTop:8, padding:'8px 18px', background:'#166534', color:'white', border:'none', borderRadius:10, fontSize:13, cursor:'pointer' }}>
              📷 Agregar evidencia
            </button>
          )}
        </div>
      )}

      {/* ── Modal de evidencia ── */}
      {showEv && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', display:'flex', alignItems:'flex-end', zIndex:100 }}>
          <div style={{ background:'white', borderRadius:'20px 20px 0 0', padding:`24px 20px calc(var(--sab) + 24px)`, width:'100%', maxHeight:'90dvh', overflowY:'auto' }}>
            <div style={{ width:40, height:4, background:'#E2E8F0', borderRadius:2, margin:'0 auto 20px' }}/>

            <div style={{ fontSize:17, fontWeight:600, marginBottom:4 }}>📷 Evidencia de entrega</div>
            <div style={{ fontSize:13, color:'#6B7280', marginBottom:20 }}>{order.orderNumber} · {order.customerName}</div>

            {/* Foto 1 */}
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:13, fontWeight:500, marginBottom:8, display:'flex', gap:6, alignItems:'center' }}>
                Foto 1
                <span style={{ fontSize:11, color:'#9F1239', background:'#FFF1F2', padding:'1px 8px', borderRadius:20 }}>requerida</span>
              </div>
              {photo1 ? (
                <div style={{ position:'relative' }}>
                  <img src={photo1} style={{ width:'100%', borderRadius:12, maxHeight:200, objectFit:'cover' }}/>
                  <button onClick={() => { setPhoto1(''); if(ref1.current) ref1.current.value='' }}
                    style={{ position:'absolute', top:8, right:8, background:'rgba(0,0,0,.65)', border:'none', borderRadius:20, color:'white', fontSize:13, padding:'5px 14px', cursor:'pointer' }}>
                    Cambiar
                  </button>
                </div>
              ) : (
                <button onClick={() => ref1.current?.click()}
                  style={{ width:'100%', padding:'28px 20px', background:'#F8FAFC', border:'2px dashed #E2E8F0', borderRadius:12, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:36 }}>📸</span>
                  <span style={{ fontSize:14, fontWeight:500, color:'#374151' }}>Tomar o subir foto</span>
                  <span style={{ fontSize:12, color:'#9CA3AF' }}>JPG, PNG · máx 5MB</span>
                </button>
              )}
              <input ref={ref1} type="file" accept="image/*" capture="environment" onChange={e=>loadPhoto(e,1)} style={{ display:'none' }}/>
            </div>

            {/* Foto 2 */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:500, marginBottom:8, display:'flex', gap:6, alignItems:'center' }}>
                Foto 2
                <span style={{ fontSize:11, color:'#6B7280', background:'#F1F5F9', padding:'1px 8px', borderRadius:20 }}>opcional</span>
              </div>
              {photo2 ? (
                <div style={{ position:'relative' }}>
                  <img src={photo2} style={{ width:'100%', borderRadius:12, maxHeight:200, objectFit:'cover' }}/>
                  <button onClick={() => { setPhoto2(''); if(ref2.current) ref2.current.value='' }}
                    style={{ position:'absolute', top:8, right:8, background:'rgba(0,0,0,.65)', border:'none', borderRadius:20, color:'white', fontSize:13, padding:'5px 14px', cursor:'pointer' }}>
                    Cambiar
                  </button>
                </div>
              ) : (
                <button onClick={() => ref2.current?.click()}
                  style={{ width:'100%', padding:'18px 20px', background:'#F8FAFC', border:'2px dashed #E2E8F0', borderRadius:12, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}>
                  <span style={{ fontSize:24 }}>📸</span>
                  <span style={{ fontSize:13, color:'#9CA3AF' }}>Segunda foto (opcional)</span>
                </button>
              )}
              <input ref={ref2} type="file" accept="image/*" capture="environment" onChange={e=>loadPhoto(e,2)} style={{ display:'none' }}/>
            </div>

            {/* Nota */}
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:13, fontWeight:500, display:'block', marginBottom:8 }}>Nota de entrega</label>
              <textarea value={evNote} onChange={e=>setEvNote(e.target.value)} rows={3}
                placeholder="Ej: Entregado al portero, firmó recepción..."
                style={{ width:'100%', padding:'12px 14px', border:'1.5px solid #E2E8F0', borderRadius:12, fontSize:15, outline:'none', resize:'none', fontFamily:'inherit' }}/>
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setShowEv(false)} className="btn btn-outline" style={{ flex:1 }}>
                Cancelar
              </button>
              <button onClick={handleSaveEvidence} disabled={saving || !photo1} className="btn btn-success" style={{ flex:2 }}>
                {saving ? 'Guardando...' : '✅ Confirmar entrega'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
