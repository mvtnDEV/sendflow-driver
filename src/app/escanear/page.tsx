'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  getDriverSession, fetchOrderByQr, fetchStores,
  getBodegaPedidos, addBodegaPedido,
  vibrate, incrementTodayScannedCount, getTodayScannedCount,
  syncPendingScans, getPendingScans,
  type ScannedOrder,
} from '@/store'

export default function EscanearPage() {
  const router   = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)

  const [token,    setToken]    = useState('')
  const [stores,   setStores]   = useState<{ id: string; name: string }[]>([])
  const [storeId,  setStoreId]  = useState('')
  const [scanned,  setScanned]  = useState<ScannedOrder[]>([])
  const [lastMsg,  setLastMsg]  = useState('')
  const [lastOk,   setLastOk]   = useState(true)
  const [noCamera, setNoCamera] = useState(false)
  const [camError, setCamError] = useState('')
  const [todayCount, setTodayCount] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const [scanning, setScanning] = useState(false)

  const readerRef    = useRef<any>(null)
  const controlsRef  = useRef<any>(null)
  const processingRef = useRef(false)

  useEffect(() => {
    const d = getDriverSession()
    if (!d) { router.replace('/login'); return }
    setToken(d.token)
    setScanned(getBodegaPedidos())
    setTodayCount(getTodayScannedCount())
    setPendingCount(getPendingScans().length)

    // Cargar tiendas (usa caché si disponible)
    fetchStores(d.token).then(s => {
      setStores(s)
      if (s.length > 0) setStoreId(s[0].id)
    })

    // Sincronizar pendientes offline si hay conexión
    if (navigator.onLine && d.token) {
      syncPendingScans(d.token).then(n => {
        if (n > 0) setPendingCount(0)
      })
    }

    startCamera()
    return () => stopCamera()
  }, [])

  async function startCamera() {
    try {
      setScanning(true)
      const { BrowserQRCodeReader } = await import('@zxing/browser')
      readerRef.current = new BrowserQRCodeReader()

      const devices = await BrowserQRCodeReader.listVideoInputDevices()
      // Preferir cámara trasera
      const backCam = devices.find(d =>
        d.label.toLowerCase().includes('back') ||
        d.label.toLowerCase().includes('rear') ||
        d.label.toLowerCase().includes('trasera')
      ) || devices[devices.length - 1]

      if (!backCam && devices.length === 0) {
        setNoCamera(true)
        setCamError('No se encontró cámara en este dispositivo')
        return
      }

      const deviceId = backCam?.deviceId

      controlsRef.current = await readerRef.current.decodeFromVideoDevice(
        deviceId,
        videoRef.current!,
        async (result: any, err: any) => {
          if (result && !processingRef.current) {
            processingRef.current = true
            await handleScannedCode(result.getText())
            setTimeout(() => { processingRef.current = false }, 2000)
          }
        }
      )
    } catch (err: any) {
      setScanning(false)
      if (err?.name === 'NotAllowedError') {
        setNoCamera(true)
        setCamError('Debes permitir el acceso a la cámara para escanear')
      } else if (err?.name === 'NotFoundError') {
        setNoCamera(true)
        setCamError('No se encontró cámara en este dispositivo')
      } else {
        setNoCamera(true)
        setCamError('Error al acceder a la cámara. Intenta recargar la página.')
      }
    }
  }

  function stopCamera() {
    try {
      controlsRef.current?.stop()
      readerRef.current?.reset?.()
    } catch {}
  }

  async function handleScannedCode(raw: string) {
    let code = raw
    try {
      const url = new URL(raw)
      code = url.searchParams.get('q') || raw
    } catch {}

    // Verificar duplicado
    const existing = getBodegaPedidos().find(o => o.orderNumber === code || o.id === code)
    if (existing) {
      vibrate([50, 30, 50]) // vibración de error
      setLastMsg(`⚠️ ${existing.orderNumber} ya fue escaneado`)
      setLastOk(false)
      setTimeout(() => setLastMsg(''), 2000)
      return
    }

    const order = await fetchOrderByQr(code, token)
    if (!order) {
      // Verificar si está offline
      if (!navigator.onLine) {
        vibrate([100, 50, 100])
        setLastMsg(`📵 Sin conexión — guardado para sincronizar`)
        setLastOk(false)
        setTimeout(() => setLastMsg(''), 3000)
        setPendingCount(p => p + 1)
        return
      }
      vibrate([50, 30, 50])
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

    // Vibración de éxito + contador
    vibrate(150)
    const newCount = incrementTodayScannedCount()
    setTodayCount(newCount)

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
      <div style={{ position:'absolute', top:0, left:0, right:0, zIndex:10, paddingTop:'calc(var(--sat) + 14px)', paddingBottom:14, paddingLeft:20, paddingRight:20, background:'linear-gradient(to bottom, rgba(0,0,0,.9) 0%, transparent 100%)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <button onClick={() => { stopCamera(); router.back() }}
            style={{ width:42, height:42, borderRadius:'50%', background:'rgba(255,255,255,.15)', border:'none', color:'white', fontSize:20, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            ←
          </button>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:15, fontWeight:600, color:'white' }}>Escanear pedidos</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,.5)', marginTop:2 }}>
              {scanned.length} escaneado{scanned.length !== 1 ? 's' : ''} · Hoy: {todayCount}
              {pendingCount > 0 && <span style={{ color:'#FCD34D', marginLeft:6 }}>· {pendingCount} pendiente{pendingCount!==1?'s':''}</span>}
            </div>
          </div>
          <button onClick={irABodega}
            style={{ padding:'8px 14px', background:'#2563EB', border:'none', borderRadius:20, color:'white', fontSize:12, fontWeight:600, cursor:'pointer' }}>
            Bodega →
          </button>
        </div>

        {/* Selector tienda — solo si hay más de 1 */}
        {stores.length > 1 && (
          <select value={storeId} onChange={e => setStoreId(e.target.value)}
            style={{ width:'100%', padding:'10px 14px', background:'rgba(255,255,255,.12)', border:'1px solid rgba(255,255,255,.2)', borderRadius:12, fontSize:14, color:'white', outline:'none', fontFamily:'inherit', appearance:'none', WebkitAppearance:'none' }}>
            {stores.map(s => (
              <option key={s.id} value={s.id} style={{ background:'#0B1628', color:'white' }}>{s.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Cámara */}
      <video ref={videoRef} muted playsInline autoPlay
        style={{ width:'100%', height:'100%', objectFit:'cover' }}/>

      {/* Marco QR — más grande y con animación */}
      <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
        <div style={{ position:'relative', width:260, height:260 }}>
          {/* Esquinas */}
          {[
            { top:0,    left:0,  borderTop:'3px solid #38BDF8', borderLeft:'3px solid #38BDF8',   borderRadius:'4px 0 0 0' },
            { top:0,    right:0, borderTop:'3px solid #38BDF8', borderRight:'3px solid #38BDF8',  borderRadius:'0 4px 0 0' },
            { bottom:0, left:0,  borderBottom:'3px solid #38BDF8', borderLeft:'3px solid #38BDF8', borderRadius:'0 0 0 4px' },
            { bottom:0, right:0, borderBottom:'3px solid #38BDF8', borderRight:'3px solid #38BDF8',borderRadius:'0 0 4px 0' },
          ].map((c, i) => (
            <div key={i} style={{ position:'absolute', width:40, height:40, ...c } as any}/>
          ))}
          {/* Línea de escaneo animada */}
          <div style={{ position:'absolute', left:8, right:8, height:2, background:'linear-gradient(90deg, transparent, #38BDF8, transparent)', animation:'scanLine 2s ease-in-out infinite', top:'50%' }}/>
        </div>
      </div>

      {/* Mensaje último escaneo */}
      {lastMsg && (
        <div style={{ position:'absolute', top:'48%', left:20, right:20, zIndex:20 }}>
          <div style={{
            background:   lastOk ? 'rgba(22,163,74,.95)' : 'rgba(220,38,38,.95)',
            borderRadius: 14, padding:'12px 18px',
            fontSize:14, fontWeight:600, color:'white', textAlign:'center',
            boxShadow:'0 4px 20px rgba(0,0,0,.3)',
          }}>
            {lastMsg}
          </div>
        </div>
      )}

      {/* Panel inferior */}
      <div style={{ position:'absolute', bottom:0, left:0, right:0, zIndex:10, paddingBottom:'calc(var(--sab) + 16px)', paddingTop:16, paddingLeft:16, paddingRight:16, background:'linear-gradient(to top, rgba(0,0,0,.95) 0%, transparent 100%)' }}>
        {scanned.length > 0 && (
          <div style={{ marginBottom:12 }}>
            {[...scanned].reverse().slice(0, 3).map(o => (
              <div key={o.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 12px', background:'rgba(255,255,255,.1)', borderRadius:10, marginBottom:4 }}>
                <div>
                  <span style={{ fontSize:12, fontWeight:700, color:'#38BDF8', fontFamily:'monospace' }}>{o.orderNumber}</span>
                  <span style={{ fontSize:11, color:'rgba(255,255,255,.6)', marginLeft:8 }}>{o.customerName}</span>
                </div>
                <span style={{ fontSize:11, color:'rgba(255,255,255,.4)' }}>📦 {o.bultos}</span>
              </div>
            ))}
          </div>
        )}

        {scanned.length > 0 ? (
          <button onClick={irABodega}
            style={{ width:'100%', padding:'15px', background:'#2563EB', border:'none', borderRadius:14, fontSize:15, fontWeight:600, color:'white', cursor:'pointer' }}>
            Ver bodega ({scanned.length} pedido{scanned.length!==1?'s':''}) →
          </button>
        ) : (
          <ManualInput onSearch={handleScannedCode}/>
        )}
      </div>

      {/* Sin cámara */}
      {noCamera && (
        <div style={{ position:'absolute', inset:0, background:'#0B1628', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:32, gap:16, zIndex:20 }}>
          <div style={{ fontSize:56 }}>📷</div>
          <div style={{ fontSize:17, fontWeight:600, color:'white', textAlign:'center' }}>Sin acceso a la cámara</div>
          <div style={{ fontSize:14, color:'rgba(255,255,255,.5)', textAlign:'center', lineHeight:1.5 }}>{camError}</div>
          <div style={{ width:'100%', maxWidth:320, marginTop:8 }}>
            <ManualInput onSearch={handleScannedCode}/>
          </div>
        </div>
      )}

      <style>{`
        @keyframes scanLine {
          0%   { top: 10%; opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { top: 90%; opacity: 0; }
        }
      `}</style>
    </div>
  )
}

function ManualInput({ onSearch }: { onSearch: (code: string) => void }) {
  const [val, setVal] = useState('')
  return (
    <div style={{ display:'flex', gap:8, width:'100%', maxWidth:400 }}>
      <input
        value={val}
        onChange={e => setVal(e.target.value.toUpperCase())}
        placeholder="Ingresar código manual..."
        autoCapitalize="characters"
        style={{ flex:1, padding:'13px 14px', borderRadius:12, fontSize:14, border:'1px solid rgba(255,255,255,.2)', background:'rgba(255,255,255,.1)', color:'white', outline:'none', fontFamily:'monospace' }}
        onKeyDown={e => { if (e.key === 'Enter' && val) { onSearch(val); setVal('') } }}
      />
      <button
        onClick={() => { if (val) { onSearch(val); setVal('') } }}
        style={{ padding:'13px 18px', background:'#2563EB', color:'white', border:'none', borderRadius:12, fontSize:14, fontWeight:600, cursor:'pointer' }}>
        OK
      </button>
    </div>
  )
}
