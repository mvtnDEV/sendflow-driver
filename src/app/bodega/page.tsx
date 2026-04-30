'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getDriverSession,
  getBodegaPedidos, removeBodegaPedido, clearBodegaPedidos,
  recepcionarBatch, salirARuta,
  type ScannedOrder,
} from '@/store'

type Step = 'lista' | 'recepcionando' | 'recepcionado' | 'saliendo' | 'enruta'

export default function BodegaPage() {
  const router  = useRouter()
  const [token,   setToken]   = useState('')
  const [pedidos, setPedidos] = useState<ScannedOrder[]>([])
  const [step,    setStep]    = useState<Step>('lista')
  const [msg,     setMsg]     = useState('')

  useEffect(() => {
    const d = getDriverSession()
    if (!d) { router.replace('/login'); return }
    setToken(d.token)
    setPedidos(getBodegaPedidos())
  }, [])

  function remove(id: string) {
    const updated = removeBodegaPedido(id)
    setPedidos([...updated])
  }

  async function handleRecepcionar() {
    if (pedidos.length === 0) return
    setStep('recepcionando')
    const ids    = pedidos.map(p => p.id)
    const result = await recepcionarBatch(ids, token)
    if (result.ok) {
      setMsg(`✅ ${result.updated} pedido${result.updated !== 1 ? 's' : ''} recepcionado${result.updated !== 1 ? 's' : ''} correctamente`)
      setStep('recepcionado')
    } else {
      setMsg('❌ Error al recepcionar. Intenta de nuevo.')
      setStep('lista')
    }
  }

  async function handleSalirARuta() {
    setStep('saliendo')
    const ids    = pedidos.map(p => p.id)
    const result = await salirARuta(ids, token)
    if (result.ok) {
      setMsg(`🚚 ${result.updated} pedido${result.updated !== 1 ? 's' : ''} en camino`)
      clearBodegaPedidos()
      setStep('enruta')
      setTimeout(() => router.replace('/pedidos'), 2500)
    } else {
      setMsg('❌ Error al salir a ruta. Intenta de nuevo.')
      setStep('recepcionado')
    }
  }

  return (
    <div style={{ height:'100dvh', display:'flex', flexDirection:'column', background:'#F0F4F8', overflow:'hidden' }}>

      {/* Header */}
      <div style={{ background:'#0B1628', paddingTop:'calc(var(--sat) + 16px)', paddingBottom:16, paddingLeft:20, paddingRight:20, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:4 }}>
          <button onClick={() => router.back()}
            style={{ width:38, height:38, borderRadius:'50%', background:'rgba(255,255,255,.1)', border:'none', color:'white', fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            ←
          </button>
          <div>
            <div style={{ fontSize:18, fontWeight:700, color:'white' }}>Bodega</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,.45)' }}>
              {pedidos.length} pedido{pedidos.length !== 1 ? 's' : ''} escaneado{pedidos.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </div>

      {/* Mensaje de estado */}
      {msg && (
        <div style={{ margin:'12px 16px 0', padding:'12px 16px', background:'white', borderRadius:12, border:'1px solid #E2E8F0', fontSize:14, fontWeight:500, color:'#374151', textAlign:'center' }}>
          {msg}
        </div>
      )}

      {/* Lista pedidos */}
      <div style={{ flex:1, overflowY:'auto', padding:'12px 16px', paddingBottom:'calc(var(--sab) + 120px)' }}>
        {pedidos.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px 20px' }}>
            <div style={{ fontSize:48, marginBottom:12 }}>📭</div>
            <div style={{ fontSize:16, fontWeight:500, color:'#374151', marginBottom:8 }}>Sin pedidos escaneados</div>
            <div style={{ fontSize:13, color:'#9CA3AF', marginBottom:20 }}>Escanea pedidos primero</div>
            <button onClick={() => router.push('/escanear')}
              style={{ padding:'12px 24px', background:'#2563EB', color:'white', border:'none', borderRadius:12, fontSize:14, fontWeight:600, cursor:'pointer' }}>
              Ir a escanear
            </button>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {pedidos.map(p => (
              <div key={p.id} style={{ background:'white', borderRadius:12, border:'1px solid #E2E8F0', padding:'12px 14px', display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'#1D4ED8', fontFamily:'monospace' }}>{p.orderNumber}</div>
                  <div style={{ fontSize:13, fontWeight:500, color:'#111', marginTop:2 }}>{p.customerName}</div>
                  <div style={{ fontSize:12, color:'#6B7280', marginTop:2 }}>{p.addressStreet}, {p.addressComuna}</div>
                  <div style={{ display:'flex', gap:8, marginTop:6 }}>
                    <span style={{ fontSize:11, background:'#F1F5F9', color:'#475569', padding:'2px 8px', borderRadius:20 }}>
                      📦 {p.bultos} bulto{p.bultos !== 1 ? 's' : ''}
                    </span>
                    <span style={{ fontSize:11, background:'#F1F5F9', color:'#475569', padding:'2px 8px', borderRadius:20 }}>
                      {p.storeName}
                    </span>
                  </div>
                </div>
                {step === 'lista' && (
                  <button onClick={() => remove(p.id)}
                    style={{ width:32, height:32, borderRadius:'50%', background:'#FFF1F2', border:'1px solid #FECDD3', color:'#9F1239', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    ×
                  </button>
                )}
                {step === 'recepcionado' && (
                  <div style={{ width:32, height:32, borderRadius:'50%', background:'#F0FDF4', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <span style={{ fontSize:16 }}>✅</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Botones de acción */}
      {pedidos.length > 0 && (
        <div style={{ position:'fixed', bottom:0, left:0, right:0, background:'white', borderTop:'1px solid #E2E8F0', padding:`16px 16px calc(var(--sab) + 16px)`, display:'flex', flexDirection:'column', gap:10 }}>

          {step === 'lista' && (
            <>
              <button onClick={() => router.push('/escanear')}
                style={{ padding:'13px', background:'#F1F5F9', border:'1px solid #E2E8F0', borderRadius:12, fontSize:14, fontWeight:500, color:'#374151', cursor:'pointer' }}>
                + Seguir escaneando
              </button>
              <button onClick={handleRecepcionar}
                style={{ padding:'14px', background:'#2563EB', border:'none', borderRadius:12, fontSize:15, fontWeight:600, color:'white', cursor:'pointer' }}>
                📥 Recepcionar {pedidos.length} pedido{pedidos.length !== 1 ? 's' : ''}
              </button>
            </>
          )}

          {step === 'recepcionando' && (
            <div style={{ padding:'14px', background:'#EFF6FF', borderRadius:12, fontSize:14, color:'#1D4ED8', textAlign:'center', fontWeight:500 }}>
              Recepcionando pedidos...
            </div>
          )}

          {step === 'recepcionado' && (
            <button onClick={handleSalirARuta}
              style={{ padding:'16px', background:'#16A34A', border:'none', borderRadius:12, fontSize:16, fontWeight:700, color:'white', cursor:'pointer' }}>
              🚚 Salir a ruta
            </button>
          )}

          {step === 'saliendo' && (
            <div style={{ padding:'14px', background:'#F0FDF4', borderRadius:12, fontSize:14, color:'#166534', textAlign:'center', fontWeight:500 }}>
              Poniendo pedidos en camino...
            </div>
          )}

          {step === 'enruta' && (
            <div style={{ padding:'14px', background:'#F0FDF4', borderRadius:12, fontSize:15, color:'#166534', textAlign:'center', fontWeight:600 }}>
              🚚 ¡En ruta! Redirigiendo...
            </div>
          )}
        </div>
      )}
    </div>
  )
}
