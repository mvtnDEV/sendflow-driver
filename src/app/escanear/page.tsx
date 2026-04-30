'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getDriverSession, fetchOrderByQr, fetchStores,
  getBodegaPedidos, addBodegaPedido,
  type ScannedOrder,
} from '@/store'

export default function EscanearPage() {
  const router    = useRouter()
  const videoRef  = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef    = useRef<number>(0)
  const cooldown  = useRef(false)

  const [token,    setToken]    = useState('')
  const [stores,   setStores]   = useState<{ id: string; name: string }[]>([])
  const [storeId,  setStoreId]  = useState('')
  const [scanned,  setScanned]  = useState<ScannedOrder[]>([])
  const [lastMsg,  setLastMsg]  = useState('')
  const [lastOk,   setLastOk]   = useState(true)
  const [noCamera, setNoCamera] = useState(false)

  useEffect(() => {
    const d = getDriverSession()
    if (!d) { router.replace('/login'); return }
    setToken(d.token)
    setScanned(getBodegaPedidos())
    fetchStores(d.token).then(s => {
      setStores(s)
      if (s.length > 0) setStoreId(s[0].id)
    })
    startCamera()
    return () => stopCamera()
  }, [])

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
        videoRef.current.onloadedmetadata = () => scanFrame()
      }
    } catch {
      setNoCamera(true)
    }
  }

  function stopCamera() {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
  }

  async function scanFrame() {
    if (cooldown.current) {
      rafRef.current = requestAnimationFrame(scanFrame)
      return
    }
    if (!videoRef.current || !canvasRef.current) return
    const video  = videoRef.current
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(scanFrame)
      return
    }
    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const jsQR = (await import('jsqr')).default
    const code  = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' })
    if (code?.data) {
      cooldown.current = true
      await handleScannedCode(code.data)
      setTimeout(() => { cooldown.current = false }, 2000)
    }
    rafRef.current = requestAnimationFrame(scanFrame)
  }

  async function handleScannedCode(raw: string) {
    let code = raw
    try { const url = new URL(raw); code = url.searchParams.get('q') || raw } catch {}

    // Verificar si ya fue escaneado
    const existing = getBodegaPedidos().find(o => o.orderNumber === code || o.id === code)
    if (existing) {
      setLastMsg(`⚠️ ${existing.orderNumber} ya fue escaneado`)
      setLastOk(false)
      setTimeout(() => setLastMsg(''), 2000)
      return
    }

    const order = await fetchOrderByQr(code, token)
    if (!order) {
      setLastMsg(`❌ No encontrado: ${code}`)
      setLastOk(false)
      setTimeout(() => setLastMsg(''), 2000)
      return
    }

    const scannedOrder: ScannedOrder = {
      id:            order.id,
      orderNumber:   order.orderNumber,
      customerName:  order.customerName,
      addressStreet: order.addressStreet,
      addressComuna: order.addressComuna,
      storeName:     order.storeName || order.store?.name || '',
      bultos:        order.bultos,
      status:        order.status,
    }

    const updated = addBodegaPedido(scannedOrder)
    setScanned([...updated])
    setLastMsg(`✅ ${order.orderNumber} — ${order.customerName}`)
    setLastOk(true)
    setTimeout(() => setLastMsg(''), 2500)
  }

  function irABodega() {
    stopCamera()
    router.push('/bodega')
  }

  return (
    <div style={{ height:'100dvh', background:'#000', display:'flex', flexDirection:'column', overflow:'hidden' }}>

      {/* Header */}
      <div style={{ position:'absolute', top:0, left:0, right:0, zIndex:10, paddingTop:'calc(var(--sat) + 14px)', paddingBottom:14, paddingLeft:20, paddingRight:20, background:'linear-gradient(to bottom, rgba(0,0,0,.85) 0%, transparent 100%)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <button onClick={() => { stopCamera(); router.back() }}
            style={{ width:42, height:42, borderRadius:'50%', background:'rgba(255,255,255,.15)', border:'none', color:'white', fontSize:20, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            ←
          </button>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:15, fontWeight:600, color:'white' }}>Escanear pedidos</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,.5)' }}>
              {scanned.length} escaneado{scanned.length !== 1 ? 's' : ''}
            </div>
          </div>
          <button onClick={irABodega}
            style={{ padding:'8px 14px', background:'#2563EB', border:'none', borderRadius:20, color:'white', fontSize:12, fontWeight:600, cursor:'pointer' }}>
            Bodega →
          </button>
        </div>

        {/* Selector de tienda */}
        {stores.length > 1 && (
          <select value={storeId} onChange={e => setStoreId(e.target.value)}
            style={{ width:'100%', padding:'10px 14px', background:'rgba(255,255,255,.12)', border:'1px solid rgba(255,255,255,.2)', borderRadius:12, fontSize:14, color:'white', outline:'none', fontFamily:'inherit' }}>
            {stores.map(s => (
              <option key={s.id} value={s.id} style={{ background:'#0B1628' }}>{s.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Cámara */}
      <video ref={videoRef} muted playsInline style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
      <canvas ref={canvasRef} style={{ display:'none' }}/>

      {/* Marco QR */}
      <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
        <div style={{ position:'relative', width:220, height:220 }}>
          {[
            { top:0, left:0, borderTop:'3px solid #38BDF8', borderLeft:'3px solid #38BDF8' },
            { top:0, right:0, borderTop:'3px solid #38BDF8', borderRight:'3px solid #38BDF8' },
            { bottom:0, left:0, borderBottom:'3px solid #38BDF8', borderLeft:'3px solid #38BDF8' },
            { bottom:0, right:0, borderBottom:'3px solid #38BDF8', borderRight:'3px solid #38BDF8' },
          ].map((c, i) => <div key={i} style={{ position:'absolute', width:32, height:32, borderRadius:4, ...c } as any}/>)}
        </div>
      </div>

      {/* Mensaje último escaneo */}
      {lastMsg && (
        <div style={{ position:'absolute', top:'46%', left:20, right:20, zIndex:20 }}>
          <div style={{ background: lastOk ? 'rgba(22,163,74,.92)' : 'rgba(220,38,38,.92)', borderRadius:12, padding:'10px 16px', fontSize:13, fontWeight:500, color:'white', textAlign:'center' }}>
            {lastMsg}
          </div>
        </div>
      )}

      {/* Panel inferior */}
      <div style={{ position:'absolute', bottom:0, left:0, right:0, zIndex:10, paddingBottom:'calc(var(--sab) + 16px)', paddingTop:16, paddingLeft:16, paddingRight:16, background:'linear-gradient(to top, rgba(0,0,0,.92) 0%, transparent 100%)' }}>

        {/* Últimos escaneados */}
        {scanned.length > 0 && (
          <div style={{ marginBottom:12 }}>
            {[...scanned].reverse().slice(0, 3).map(o => (
              <div key={o.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 10px', background:'rgba(255,255,255,.1)', borderRadius:8, marginBottom:4 }}>
                <div>
                  <span style={{ fontSize:12, fontWeight:600, color:'#38BDF8', fontFamily:'monospace' }}>{o.orderNumber}</span>
                  <span style={{ fontSize:11, color:'rgba(255,255,255,.6)', marginLeft:8 }}>{o.customerName}</span>
                </div>
                <span style={{ fontSize:11, color:'rgba(255,255,255,.4)' }}>📦 {o.bultos}</span>
              </div>
            ))}
          </div>
        )}

        {scanned.length > 0 ? (
          <button onClick={irABodega}
            style={{ width:'100%', padding:'14px', background:'#2563EB', border:'none', borderRadius:14, fontSize:15, fontWeight:600, color:'white', cursor:'pointer' }}>
            Ver bodega ({scanned.length} pedidos) →
          </button>
        ) : (
          <ManualInput onSearch={handleScannedCode}/>
        )}
      </div>

      {/* Sin cámara */}
      {noCamera && (
        <div style={{ position:'absolute', inset:0, background:'#0B1628', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:32, gap:16 }}>
          <div style={{ fontSize:48 }}>📷</div>
          <div style={{ fontSize:16, fontWeight:600, color:'white' }}>Sin acceso a la cámara</div>
          <ManualInput onSearch={handleScannedCode}/>
        </div>
      )}
    </div>
  )
}

function ManualInput({ onSearch }: { onSearch: (code: string) => void }) {
  const [val, setVal] = useState('')
  return (
    <div style={{ display:'flex', gap:8, width:'100%', maxWidth:400 }}>
      <input value={val} onChange={e => setVal(e.target.value.toUpperCase())} placeholder="Ingresar código manual..."
        style={{ flex:1, padding:'12px 14px', borderRadius:12, fontSize:14, border:'1px solid rgba(255,255,255,.2)', background:'rgba(255,255,255,.1)', color:'white', outline:'none', fontFamily:'monospace' }}
        onKeyDown={e => e.key === 'Enter' && val && onSearch(val)}/>
      <button onClick={() => val && onSearch(val)}
        style={{ padding:'12px 16px', background:'#2563EB', color:'white', border:'none', borderRadius:12, fontSize:14, fontWeight:600, cursor:'pointer' }}>
        OK
      </button>
    </div>
  )
}
