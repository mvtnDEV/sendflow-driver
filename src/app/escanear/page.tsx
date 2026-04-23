'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getDriverSession, getOrderById } from '@/store'

type ScanState = 'scanning' | 'found' | 'not_found' | 'no_camera'

export default function EscanearPage() {
  const router   = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef= useRef<HTMLCanvasElement>(null)
  const streamRef= useRef<MediaStream | null>(null)
  const rafRef   = useRef<number>(0)

  const [state,     setState]     = useState<ScanState>('scanning')
  const [scannedId, setScannedId] = useState('')
  const [torch,     setTorch]     = useState(false)
  const [message,   setMessage]   = useState('')

  useEffect(() => {
    const session = getDriverSession()
    if (!session) { router.replace('/login'); return }
    startCamera()
    return () => stopCamera()
  }, [])

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',   // cámara trasera
          width:  { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
        videoRef.current.onloadedmetadata = () => scanFrame()
      }
    } catch (err) {
      console.error('Camera error:', err)
      setState('no_camera')
    }
  }

  function stopCamera() {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
  }

  async function scanFrame() {
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

    // Importar jsQR dinámicamente
    const jsQR = (await import('jsqr')).default
    const code  = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert',
    })

    if (code?.data) {
      handleScannedCode(code.data)
      return
    }

    rafRef.current = requestAnimationFrame(scanFrame)
  }

  function handleScannedCode(raw: string) {
    stopCamera()

    // Extraer código SF del QR (puede venir como URL o como código directo)
    let code = raw
    try {
      const url = new URL(raw)
      code = url.searchParams.get('q') || raw
    } catch { /* not a URL, use as-is */ }

    setScannedId(code)

    const order = getOrderById(code)
    if (order) {
      setState('found')
      router.push(`/pedidos/${order.id}?scanned=1`)
    } else {
      setState('not_found')
      setMessage(`Código: ${code}`)
    }
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    try {
      const capabilities = track.getCapabilities() as any
      if (capabilities.torch) {
        await (track as any).applyConstraints({ advanced: [{ torch: !torch }] })
        setTorch(t => !t)
      }
    } catch (e) { console.log('Torch not supported') }
  }

  function retry() {
    setState('scanning')
    setScannedId('')
    setMessage('')
    startCamera()
  }

  return (
    <div style={{ height:'100dvh', background:'#000', display:'flex', flexDirection:'column', overflow:'hidden' }}>

      {/* ── Topbar ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        paddingTop: 'calc(var(--sat) + 14px)',
        paddingBottom: 14, paddingLeft: 20, paddingRight: 20,
        background: 'linear-gradient(to bottom, rgba(0,0,0,.7) 0%, transparent 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <button onClick={() => { stopCamera(); router.back() }}
          style={{ width:42, height:42, borderRadius:'50%', background:'rgba(255,255,255,.15)', border:'none', color:'white', fontSize:20, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
          ←
        </button>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:16, fontWeight:600, color:'white' }}>Escanear QR</div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,.6)' }}>Apunta al código del paquete</div>
        </div>
        <button onClick={toggleTorch}
          style={{ width:42, height:42, borderRadius:'50%', background: torch ? '#F59E0B' : 'rgba(255,255,255,.15)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
            <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 0 0 1.946-.806 3.42 3.42 0 0 1 4.438 0 3.42 3.42 0 0 0 1.946.806 3.42 3.42 0 0 1 3.138 3.138 3.42 3.42 0 0 0 .806 1.946 3.42 3.42 0 0 1 0 4.438 3.42 3.42 0 0 0-.806 1.946 3.42 3.42 0 0 1-3.138 3.138 3.42 3.42 0 0 0-1.946.806 3.42 3.42 0 0 1-4.438 0 3.42 3.42 0 0 0-1.946-.806 3.42 3.42 0 0 1-3.138-3.138 3.42 3.42 0 0 0-.806-1.946 3.42 3.42 0 0 1 0-4.438 3.42 3.42 0 0 0 .806-1.946 3.42 3.42 0 0 1 3.138-3.138z"/>
          </svg>
        </button>
      </div>

      {/* ── Video ── */}
      <video ref={videoRef} muted playsInline
        style={{ width:'100%', height:'100%', objectFit:'cover', display: state === 'scanning' ? 'block' : 'none' }}/>
      <canvas ref={canvasRef} style={{ display:'none' }}/>

      {/* ── Overlay viewfinder ── */}
      {state === 'scanning' && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
          <div style={{ position:'relative', width:240, height:240 }}>
            {/* Corners */}
            {[
              { top:0,    left:0,  borderTop:'3px solid white', borderLeft:'3px solid white', borderTopLeftRadius:8 },
              { top:0,    right:0, borderTop:'3px solid white', borderRight:'3px solid white', borderTopRightRadius:8 },
              { bottom:0, left:0,  borderBottom:'3px solid white', borderLeft:'3px solid white', borderBottomLeftRadius:8 },
              { bottom:0, right:0, borderBottom:'3px solid white', borderRight:'3px solid white', borderBottomRightRadius:8 },
            ].map((c, i) => (
              <div key={i} style={{ position:'absolute', width:32, height:32, ...c } as any}/>
            ))}
            {/* Scan line animation */}
            <div style={{
              position:'absolute', left:8, right:8, height:2,
              background:'linear-gradient(90deg, transparent, #38BDF8, transparent)',
              animation: 'scan 1.8s ease-in-out infinite',
            }}/>
          </div>
          <style>{`
            @keyframes scan {
              0%   { top: 8px; }
              50%  { top: 220px; }
              100% { top: 8px; }
            }
          `}</style>
        </div>
      )}

      {/* ── Sin cámara ── */}
      {state === 'no_camera' && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:32, background:'#0B1628', gap:16 }}>
          <div style={{ fontSize:48 }}>📷</div>
          <div style={{ fontSize:18, fontWeight:600, color:'white', textAlign:'center' }}>Sin acceso a la cámara</div>
          <div style={{ fontSize:14, color:'rgba(255,255,255,.5)', textAlign:'center' }}>
            Permite el acceso a la cámara en la configuración de tu navegador
          </div>
          <div style={{ marginTop:8, width:'100%', maxWidth:320 }}>
            <ManualInput onSearch={(code) => handleScannedCode(code)}/>
          </div>
        </div>
      )}

      {/* ── No encontrado ── */}
      {state === 'not_found' && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:32, background:'#0B1628', gap:16 }}>
          <div style={{ fontSize:48 }}>❌</div>
          <div style={{ fontSize:18, fontWeight:600, color:'white', textAlign:'center' }}>Pedido no encontrado</div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,.5)', textAlign:'center', fontFamily:'monospace' }}>{message}</div>
          <div style={{ width:'100%', maxWidth:320, marginTop:8, display:'flex', flexDirection:'column', gap:10 }}>
            <button onClick={retry} className="btn btn-primary">
              Escanear de nuevo
            </button>
            <ManualInput onSearch={handleScannedCode}/>
          </div>
        </div>
      )}

      {/* ── Texto inferior ── */}
      {state === 'scanning' && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10,
          paddingBottom: 'calc(var(--sab) + 24px)',
          paddingTop: 20, paddingLeft: 24, paddingRight: 24,
          background: 'linear-gradient(to top, rgba(0,0,0,.7) 0%, transparent 100%)',
        }}>
          <ManualInput onSearch={handleScannedCode} dark/>
        </div>
      )}
    </div>
  )
}

// ─── Input manual (cuando no se puede escanear) ───────────────────────────────

function ManualInput({ onSearch, dark }: { onSearch: (code: string) => void; dark?: boolean }) {
  const [val, setVal] = useState('')
  return (
    <div style={{ display:'flex', gap:8 }}>
      <input value={val} onChange={e => setVal(e.target.value.toUpperCase())}
        placeholder="Ingresar código manual..."
        style={{
          flex:1, padding:'12px 14px', borderRadius:12, fontSize:14,
          border: dark ? '1px solid rgba(255,255,255,.2)' : '1.5px solid #E2E8F0',
          background: dark ? 'rgba(255,255,255,.1)' : 'white',
          color: dark ? 'white' : '#1C1C1E',
          outline:'none', fontFamily:'monospace',
        }}
        onKeyDown={e => e.key === 'Enter' && val && onSearch(val)}/>
      <button onClick={() => val && onSearch(val)}
        style={{ padding:'12px 16px', background:'#2563EB', color:'white', border:'none', borderRadius:12, fontSize:14, fontWeight:600, cursor:'pointer' }}>
        OK
      </button>
    </div>
  )
}
