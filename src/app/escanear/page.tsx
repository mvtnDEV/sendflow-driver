'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getDriverSession, fetchOrderByQr } from '@/store'

type ScanState = 'scanning' | 'found' | 'not_found' | 'no_camera'

export default function EscanearPage() {
  const router   = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef= useRef<HTMLCanvasElement>(null)
  const streamRef= useRef<MediaStream | null>(null)
  const rafRef   = useRef<number>(0)

  const [state,   setState]   = useState<ScanState>('scanning')
  const [message, setMessage] = useState('')
  const [token,   setToken]   = useState('')

  useEffect(() => {
    const d = getDriverSession()
    if (!d) { router.replace('/login'); return }
    setToken(d.token)
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
    const jsQR = (await import('jsqr')).default
    const code  = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' })
    if (code?.data) { handleScannedCode(code.data); return }
    rafRef.current = requestAnimationFrame(scanFrame)
  }

  async function handleScannedCode(raw: string) {
    stopCamera()
    let code = raw
    try { const url = new URL(raw); code = url.searchParams.get('q') || raw } catch {}

    const order = await fetchOrderByQr(code, token)
    if (order) {
      setState('found')
      router.push(`/pedidos/${order.id}?scanned=1`)
    } else {
      setState('not_found')
      setMessage(`Código: ${code}`)
    }
  }

  function retry() { setState('scanning'); setMessage(''); startCamera() }

  return (
    <div style={{ height:'100dvh', background:'#000', display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ position:'absolute', top:0, left:0, right:0, zIndex:10, paddingTop:'calc(var(--sat) + 14px)', paddingBottom:14, paddingLeft:20, paddingRight:20, background:'linear-gradient(to bottom, rgba(0,0,0,.7) 0%, transparent 100%)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <button onClick={() => { stopCamera(); router.back() }}
          style={{ width:42, height:42, borderRadius:'50%', background:'rgba(255,255,255,.15)', border:'none', color:'white', fontSize:20, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
          ←
        </button>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:16, fontWeight:600, color:'white' }}>Escanear QR</div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,.6)' }}>Apunta al código del paquete</div>
        </div>
        <div style={{ width:42 }}/>
      </div>

      <video ref={videoRef} muted playsInline style={{ width:'100%', height:'100%', objectFit:'cover', display:state==='scanning'?'block':'none' }}/>
      <canvas ref={canvasRef} style={{ display:'none' }}/>

      {state === 'scanning' && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
          <div style={{ position:'relative', width:240, height:240 }}>
            {[
              { top:0, left:0, borderTop:'3px solid white', borderLeft:'3px solid white' },
              { top:0, right:0, borderTop:'3px solid white', borderRight:'3px solid white' },
              { bottom:0, left:0, borderBottom:'3px solid white', borderLeft:'3px solid white' },
              { bottom:0, right:0, borderBottom:'3px solid white', borderRight:'3px solid white' },
            ].map((c, i) => <div key={i} style={{ position:'absolute', width:32, height:32, borderRadius:4, ...c } as any}/>)}
          </div>
        </div>
      )}

      {state === 'no_camera' && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:32, background:'#0B1628', gap:16 }}>
          <div style={{ fontSize:48 }}>📷</div>
          <div style={{ fontSize:18, fontWeight:600, color:'white' }}>Sin acceso a la cámara</div>
          <ManualInput onSearch={handleScannedCode} dark/>
        </div>
      )}

      {state === 'not_found' && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:32, background:'#0B1628', gap:16 }}>
          <div style={{ fontSize:48 }}>❌</div>
          <div style={{ fontSize:18, fontWeight:600, color:'white' }}>Pedido no encontrado</div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,.5)', fontFamily:'monospace' }}>{message}</div>
          <button onClick={retry} style={{ padding:'12px 24px', background:'#2563EB', color:'white', border:'none', borderRadius:12, fontSize:14, fontWeight:600, cursor:'pointer' }}>
            Escanear de nuevo
          </button>
          <ManualInput onSearch={handleScannedCode} dark/>
        </div>
      )}

      {state === 'scanning' && (
        <div style={{ position:'absolute', bottom:0, left:0, right:0, zIndex:10, paddingBottom:'calc(var(--sab) + 24px)', paddingTop:20, paddingLeft:24, paddingRight:24, background:'linear-gradient(to top, rgba(0,0,0,.7) 0%, transparent 100%)' }}>
          <ManualInput onSearch={handleScannedCode} dark/>
        </div>
      )}
    </div>
  )
}

function ManualInput({ onSearch, dark }: { onSearch: (code: string) => void; dark?: boolean }) {
  const [val, setVal] = useState('')
  return (
    <div style={{ display:'flex', gap:8, width:'100%', maxWidth:320 }}>
      <input value={val} onChange={e => setVal(e.target.value.toUpperCase())} placeholder="Ingresar código manual..."
        style={{ flex:1, padding:'12px 14px', borderRadius:12, fontSize:14, border:dark?'1px solid rgba(255,255,255,.2)':'1.5px solid #E2E8F0', background:dark?'rgba(255,255,255,.1)':'white', color:dark?'white':'#1C1C1E', outline:'none', fontFamily:'monospace' }}
        onKeyDown={e => e.key==='Enter' && val && onSearch(val)}/>
      <button onClick={() => val && onSearch(val)}
        style={{ padding:'12px 16px', background:'#2563EB', color:'white', border:'none', borderRadius:12, fontSize:14, fontWeight:600, cursor:'pointer' }}>
        OK
      </button>
    </div>
  )
}
