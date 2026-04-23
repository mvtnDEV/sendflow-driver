'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getDriverSession, seedDemoOrders, clearDemoOrders, getAllOrders, generateQRDataUrl } from '@/store'

interface QRItem { id: string; orderNumber: string; customer: string; qrDataUrl: string }

export default function DemoSetupPage() {
  const router  = useRouter()
  const [qrs,     setQrs]     = useState<QRItem[]>([])
  const [loading, setLoading] = useState(false)
  const [seeded,  setSeeded]  = useState(false)

  useEffect(() => {
    const d = getDriverSession()
    if (!d) { router.replace('/login'); return }
    // Si ya hay pedidos, mostrar sus QRs
    const orders = getAllOrders()
    if (orders.length > 0) {
      setSeeded(true)
      loadQRs(orders.map(o => o.id))
    }
  }, [])

  async function handleSeed() {
    setLoading(true)
    const { qrCodes } = seedDemoOrders()
    setSeeded(true)
    await loadQRs(qrCodes)
    setLoading(false)
  }

  async function loadQRs(ids: string[]) {
    const orders = getAllOrders()
    const items: QRItem[] = []
    for (const id of ids.slice(0, 4)) {
      const order = orders.find(o => o.id === id)
      if (!order) continue
      const dataUrl = await generateQRDataUrl(id, typeof window !== 'undefined' ? window.location.origin : '')
      items.push({ id, orderNumber: order.orderNumber, customer: order.customerName, qrDataUrl: dataUrl })
    }
    setQrs(items)
  }

  function handleClear() {
    if (!confirm('¿Borrar todos los pedidos demo?')) return
    clearDemoOrders()
    setSeeded(false)
    setQrs([])
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#F0F4F8',
      paddingTop: 'calc(var(--sat) + 20px)',
      paddingBottom: 'calc(var(--sab) + 24px)',
      paddingLeft: 16, paddingRight: 16,
    }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
        <button onClick={() => router.back()}
          style={{ width:40, height:40, borderRadius:'50%', background:'white', border:'1px solid #E2E8F0', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:18 }}>
          ←
        </button>
        <div>
          <div style={{ fontSize:18, fontWeight:700 }}>Demo QR</div>
          <div style={{ fontSize:13, color:'#6B7280' }}>Pedidos de prueba para escanear</div>
        </div>
      </div>

      {!seeded ? (
        /* Estado vacío */
        <div style={{ background:'white', borderRadius:20, padding:28, textAlign:'center', marginBottom:16 }}>
          <div style={{ fontSize:56, marginBottom:16 }}>📦</div>
          <div style={{ fontSize:17, fontWeight:600, marginBottom:8 }}>No hay pedidos cargados</div>
          <div style={{ fontSize:14, color:'#6B7280', marginBottom:24, lineHeight:1.6 }}>
            Carga pedidos de demostración para probar el escáner QR y el flujo completo de entrega
          </div>
          <button onClick={handleSeed} disabled={loading}
            style={{ width:'100%', padding:'16px', background: loading ? '#93C5FD' : '#2563EB', color:'white', border:'none', borderRadius:14, fontSize:16, fontWeight:600, cursor:loading?'not-allowed':'pointer' }}>
            {loading ? 'Generando pedidos y QRs...' : '🚀 Cargar pedidos de demo'}
          </button>
        </div>
      ) : (
        <>
          {/* Instrucciones */}
          <div style={{ background:'#EFF6FF', borderRadius:14, padding:'14px 16px', marginBottom:16, display:'flex', gap:10, alignItems:'flex-start' }}>
            <span style={{ fontSize:20, flexShrink:0 }}>ℹ️</span>
            <div style={{ fontSize:13, color:'#1D4ED8', lineHeight:1.6 }}>
              Escanea cualquiera de estos QR con el botón de la cámara para probar el flujo completo de recepción y entrega.
            </div>
          </div>

          {/* QR Codes */}
          {loading ? (
            <div style={{ textAlign:'center', padding:40, color:'#9CA3AF', fontSize:14 }}>Generando QRs...</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {qrs.map(item => (
                <div key={item.id} style={{ background:'white', borderRadius:18, padding:20, border:'1px solid #E2E8F0' }}>
                  <div style={{ display:'flex', gap:16, alignItems:'center' }}>
                    {/* QR */}
                    <div style={{ flexShrink:0 }}>
                      {item.qrDataUrl ? (
                        <img src={item.qrDataUrl} alt={item.id} style={{ width:100, height:100, imageRendering:'pixelated' }}/>
                      ) : (
                        <div style={{ width:100, height:100, background:'#F1F5F9', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, color:'#9CA3AF' }}>
                          Cargando...
                        </div>
                      )}
                    </div>
                    {/* Info */}
                    <div style={{ flex:1, overflow:'hidden' }}>
                      <div style={{ fontSize:11, color:'#9CA3AF', marginBottom:3, textTransform:'uppercase', letterSpacing:'.05em' }}>
                        {item.orderNumber}
                      </div>
                      <div style={{ fontFamily:'monospace', fontSize:15, fontWeight:700, color:'#1D4ED8', letterSpacing:'.5px', marginBottom:4, wordBreak:'break-all' }}>
                        {item.id}
                      </div>
                      <div style={{ fontSize:14, fontWeight:500, color:'#111', marginBottom:2 }}>{item.customer}</div>
                      <div style={{ fontSize:12, color:'#6B7280' }}>Escanea para abrir el pedido</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Botones */}
          <div style={{ marginTop:20, display:'flex', flexDirection:'column', gap:10 }}>
            <button onClick={() => router.push('/pedidos')}
              style={{ width:'100%', padding:'15px', background:'#2563EB', color:'white', border:'none', borderRadius:14, fontSize:15, fontWeight:600, cursor:'pointer' }}>
              Ver lista de pedidos →
            </button>
            <button onClick={handleClear}
              style={{ width:'100%', padding:'13px', background:'white', color:'#DC2626', border:'1.5px solid #FECDD3', borderRadius:14, fontSize:14, fontWeight:500, cursor:'pointer' }}>
              🗑 Borrar pedidos demo y empezar de nuevo
            </button>
          </div>
        </>
      )}
    </div>
  )
}
