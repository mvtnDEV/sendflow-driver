'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getDriverSession, fetchOrderByQr, fetchStores,
  getBodegaPedidos, addBodegaPedido,
  vibrate, incrementTodayScannedCount, getTodayScannedCount,
  syncPendingScans, getPendingScans,
  type ScannedOrder,
} from '@/store'

function playBeep(ok: boolean) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = ok ? 1200 : 400
    osc.type = 'square'
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (ok ? 0.15 : 0.3))
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + (ok ? 0.15 : 0.3))
  } catch {}
}

export default function EscanearPage() {
  const router   = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)

  const [token,         setToken]         = useState('')
  const [stores,        setStores]        = useState<{ id: string; name: string }[]>([])
  const [storeId,       setStoreId]       = useState('')
  const [scanned,       setScanned]       = useState<ScannedOrder[]>([])
  const [lastMsg,       setLastMsg]       = useState('')
  const [lastOk,        setLastOk]        = useState(true)
  const [noCamera,      setNoCamera]      = useState(false)
  const [camError,      setCamError]      = useState('')
  const [todayCount,    setTodayCount]    = useState(0)
  const [pendingCount,  setPendingCount]  = useState(0)
  const [cameraActive,  setCameraActive]  = useState(false)
  const [loadingStores, setLoadingStores] = useState(true)

  const readerRef     = useRef<any>(null)
  const controlsRef   = useRef<any>(null)
  const processingRef = useRef(false)
  const storeIdRef    = useRef(storeId)

  useEffect(() => { storeIdRef.current = storeId }, [storeId])

  useEffect(() => {
    const d = getDriverSession()
    if (!d) { router.replace('/login'); return }
    setToken(d.token)
    setScanned(getBodegaPedidos())
    setTodayCount(getTodayScannedCount())
    setPendingCount(getPendingScans().length)

    // ── Cargar tiendas — detectar sesión expirada ──
    fetchStores(d.token).then(s => {
      if (s === 'SESSION_EXPIRED') {
        router.replace('/login')
        return
      }
      setStores(s)
      if (s.length > 0) setStoreId(s[0].id)
      setLoadingStores(false)
    })

    if (navigator.onLine && d.token) {
      syncPendingScans(d.token).then(n => { if (n > 0) setPendingCount(0) })
    }

    return () => stopCamera()
  }, [])

  async function startCamera() {
    try {
      setCameraActive(true)

      // ── BrowserMultiFormatReader con hints QR-only es 3-4x más rápido en mobile ──
      const { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType } = await import('@zxing/browser')

      const hints = new Map()
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE])
      hints.set(DecodeHintType.TRY_HARDER, true)

      readerRef.current = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: 50,   // más agresivo — 50ms en vez de 100ms
        delayBetweenScanSuccess:  1500,
      })

      const devices = await BrowserMultiFormatReader.listVideoInputDevices()

      if (devices.length === 0) {
        setNoCamera(true)
        setCamError('No se encontró cámara en este dispositivo')
        setCameraActive(false)
        return
      }

      // Preferir cámara trasera, fallback a la última disponible
      const backCam = devices.find(d =>
        d.label.toLowerCase().includes('back') ||
        d.label.toLowerCase().includes('rear') ||
        d.label.toLowerCase().includes('trasera') ||
        d.label.toLowerCase().includes('environment')
      ) ?? devices[devices.length - 1]

      // Solicitar la cámara con resolución óptima para QR
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId:   backCam.deviceId ? { exact: backCam.deviceId } : undefined,
          facingMode: 'environment',
          width:      { ideal: 1280 },
          height:     { ideal: 720 },
          focusMode:  'continuous' as any,
        },
      })

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      controlsRef.current = await readerRef.current.decodeFromStream(
        stream,
        videoRef.current!,
        async (result: any, err: any) => {
          if (result && !processingRef.current) {
            processingRef.current = true
            await handleScannedCode(result.getText())
            setTimeout(() => { processingRef.current = false }, 1500)
          }
        }
      )

    } catch (err: any) {
      setCameraActive(false)
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
    setCameraActive(false)
  }

  async function handleScannedCode(raw: string) {
    let code = raw
    try {
      const url = new URL(raw)
      code = url.searchParams.get('q') || raw
    } catch {}

    const existing = getBodegaPedidos().find(o => o.orderNumber === code || o.id === code)
    if (existing) {
      playBeep(false)
      vibrate([50, 30, 50])
      setLastMsg(`⚠️ ${existing.orderNumber} ya fue escaneado`)
      setLastOk(false)
      setTimeout(() => setLastMsg(''), 2000)
      return
    }

    const order = await fetchOrderByQr(code, token)
    if (!order) {
      if (!navigator.onLine) {
        playBeep(false)
        vibrate([100, 50, 100])
        setLastMsg(`📵 Sin conexión — guardado para sincronizar`)
        setLastOk(false)
        setTimeout(() => setLastMsg(''), 3000)
        setPendingCount(p => p + 1)
        return
      }
      playBeep(false)
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
    playBeep(true)
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

  // ── Pantalla de selección de tienda ──
  if (!cameraActive) {
    return (
      <div style={{ height:'100dvh', background:'linear-gradient(160deg, #0B1628 0%, #162544 100%)', display:'flex', flexDirection:'column', overflow:'hidden' }}>

        {/* Header fijo */}
        <div style={{ padding:'calc(var(--sat, 0px) + 20px) 20px 16px', borderBottom:'1px solid rgba(255,255,255,.08)', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <button onClick={() => router.back()}
              style={{ width:42, height:42, borderRadius:'50%', background:'rgba(255,255,255,.1)', border:'none', color:'white', fontSize:20, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              ←
            </button>
            <div>
              <div style={{ fontSize:18, fontWeight:700, color:'white' }}>Escanear pedidos</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,.4)', marginTop:2 }}>
                Selecciona la tienda para continuar
              </div>
            </div>
          </div>
        </div>

        {/* Lista de tiendas — con scroll */}
        <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:10 }}>
          {loadingStores ? (
            <div style={{ padding:32, fontSize:14, color:'rgba(255,255,255,.4)', textAlign:'center' }}>
              Cargando tiendas...
            </div>
          ) : stores.length === 0 ? (
            <div style={{ padding:24, background:'rgba(255,59,48,.15)', borderRadius:16, fontSize:13, color:'#FF6B6B', textAlign:'center' }}>
              No hay tiendas disponibles
            </div>
          ) : (
            <>
              <div style={{ fontSize:11, color:'rgba(255,255,255,.35)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:4 }}>
                {stores.length} tienda{stores.length !== 1 ? 's' : ''} disponible{stores.length !== 1 ? 's' : ''}
              </div>
              {stores.map(s => (
                <button key={s.id} onClick={() => setStoreId(s.id)}
                  style={{
                    padding:'16px 18px', borderRadius:14,
                    border: storeId === s.id ? 'none' : '1px solid rgba(255,255,255,.1)',
                    cursor:'pointer', textAlign:'left',
                    background: storeId === s.id
                      ? 'linear-gradient(135deg, #2563EB, #1D4ED8)'
                      : 'rgba(255,255,255,.06)',
                    color: storeId === s.id ? 'white' : 'rgba(255,255,255,.7)',
                    boxShadow: storeId === s.id ? '0 4px 16px rgba(37,99,235,.4)' : 'none',
                    display:'flex', alignItems:'center', justifyContent:'space-between',
                    transition:'all .15s', flexShrink:0, width:'100%',
                  }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{
                      width:36, height:36, borderRadius:10, flexShrink:0,
                      background: storeId === s.id ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.08)',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:13, fontWeight:700, color:'white',
                    }}>
                      {s.name.slice(0, 2).toUpperCase()}
                    </div>
                    <span style={{ fontSize:15, fontWeight:600 }}>{s.name}</span>
                  </div>
                  {storeId === s.id && (
                    <div style={{ width:24, height:24, borderRadius:'50%', background:'rgba(255,255,255,.25)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>
                      ✓
                    </div>
                  )}
                </button>
              ))}
            </>
          )}

          {todayCount > 0 && (
            <div style={{ padding:'12px 16px', background:'rgba(255,255,255,.05)', borderRadius:12, display:'flex', justifyContent:'space-between', marginTop:4 }}>
              <span style={{ fontSize:13, color:'rgba(255,255,255,.4)' }}>Escaneados hoy</span>
              <span style={{ fontSize:13, fontWeight:600, color:'#38BDF8' }}>{todayCount}</span>
            </div>
          )}
        </div>

        {/* Botón confirmar — fijo abajo */}
        <div style={{ padding:'16px 20px', paddingBottom:'calc(var(--sab, 0px) + 16px)', borderTop:'1px solid rgba(255,255,255,.08)', background:'rgba(11,22,40,.95)', flexShrink:0 }}>
          {storeId && (
            <div style={{ fontSize:12, color:'rgba(255,255,255,.4)', textAlign:'center', marginBottom:10 }}>
              Tienda seleccionada: <span style={{ color:'white', fontWeight:600 }}>{stores.find(s => s.id === storeId)?.name}</span>
            </div>
          )}
          <button
            onClick={startCamera}
            disabled={!storeId || loadingStores}
            style={{
              width:'100%', padding:'18px',
              background: !storeId || loadingStores
                ? 'rgba(255,255,255,.08)'
                : 'linear-gradient(135deg, #2563EB, #1D4ED8)',
              border:'none', borderRadius:16,
              fontSize:16, fontWeight:700, color:'white',
              cursor: !storeId || loadingStores ? 'not-allowed' : 'pointer',
              opacity: !storeId || loadingStores ? .4 : 1,
              display:'flex', alignItems:'center', justifyContent:'center', gap:10,
              boxShadow: !storeId || loadingStores ? 'none' : '0 4px 20px rgba(37,99,235,.5)',
            }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
              <rect x="7" y="7" width="10" height="10" rx="1"/>
            </svg>
            {!storeId ? 'Selecciona una tienda' : 'Confirmar y abrir escáner'}
          </button>
        </div>
      </div>
    )
  }

  // ── Pantalla del escáner ──
  return (
    <div style={{ height:'100dvh', background:'#000', display:'flex', flexDirection:'column', overflow:'hidden' }}>

      {/* Header */}
      <div style={{ position:'absolute', top:0, left:0, right:0, zIndex:10, paddingTop:'calc(var(--sat, 0px) + 14px)', paddingBottom:14, paddingLeft:20, paddingRight:20, background:'linear-gradient(to bottom, rgba(0,0,0,.9) 0%, transparent 100%)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
          <button onClick={() => stopCamera()}
            style={{ width:42, height:42, borderRadius:'50%', background:'rgba(255,255,255,.15)', border:'none', color:'white', fontSize:20, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            ←
          </button>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:15, fontWeight:600, color:'white' }}>Escanear pedidos</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,.5)', marginTop:2 }}>
              {stores.find(s => s.id === storeId)?.name} · {scanned.length} escaneado{scanned.length !== 1 ? 's' : ''} · Hoy: {todayCount}
              {pendingCount > 0 && <span style={{ color:'#FCD34D', marginLeft:6 }}>· {pendingCount} pendiente{pendingCount!==1?'s':''}</span>}
            </div>
          </div>
          <button onClick={irABodega}
            style={{ padding:'8px 14px', background:'#2563EB', border:'none', borderRadius:20, color:'white', fontSize:12, fontWeight:600, cursor:'pointer' }}>
            Bodega →
          </button>
        </div>
      </div>

      {/* Cámara */}
      <video ref={videoRef} muted playsInline autoPlay
        style={{ width:'100%', height:'100%', objectFit:'cover' }}/>

      {/* Marco QR */}
      <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
        <div style={{ position:'relative', width:260, height:260 }}>
          {[
            { top:0,    left:0,  borderTop:'3px solid #38BDF8', borderLeft:'3px solid #38BDF8',    borderRadius:'4px 0 0 0' },
            { top:0,    right:0, borderTop:'3px solid #38BDF8', borderRight:'3px solid #38BDF8',   borderRadius:'0 4px 0 0' },
            { bottom:0, left:0,  borderBottom:'3px solid #38BDF8', borderLeft:'3px solid #38BDF8', borderRadius:'0 0 0 4px' },
            { bottom:0, right:0, borderBottom:'3px solid #38BDF8', borderRight:'3px solid #38BDF8',borderRadius:'0 0 4px 0' },
          ].map((c, i) => (
            <div key={i} style={{ position:'absolute', width:40, height:40, ...c } as any}/>
          ))}
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
      <div style={{ position:'absolute', bottom:0, left:0, right:0, zIndex:10, paddingBottom:'calc(var(--sab, 0px) + 16px)', paddingTop:16, paddingLeft:16, paddingRight:16, background:'linear-gradient(to top, rgba(0,0,0,.95) 0%, transparent 100%)' }}>
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
