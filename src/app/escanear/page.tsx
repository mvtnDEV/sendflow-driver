"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getDriverSession,
  scanCode,
  getBodegaPedidos,
  addBodegaPedido,
  vibrate,
  incrementTodayScannedCount,
  getTodayScannedCount,
  syncPendingScans,
  getPendingScans,
  type ScannedOrder,
} from "@/store";

type Tono = "ok" | "warn" | "error";

function playBeep(tono: Tono) {
  try {
    const ctx = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = tono === "ok" ? 1200 : tono === "warn" ? 800 : 400;
    osc.type = "square";
    const dur = tono === "ok" ? 0.15 : tono === "warn" ? 0.2 : 0.35;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + dur);
  } catch {}
}

const TOAST_BG: Record<Tono, string> = {
  ok: "rgba(22,163,74,.95)",
  warn: "rgba(217,119,6,.95)",
  error: "rgba(220,38,38,.95)",
};

export default function EscanearPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [token, setToken] = useState("");
  const [scanned, setScanned] = useState<ScannedOrder[]>([]);
  const [toast, setToast] = useState<{
    msg: string;
    sub?: string;
    tono: Tono;
  } | null>(null);
  const [noCamera, setNoCamera] = useState(false);
  const [camError, setCamError] = useState("");
  const [todayCount, setTodayCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [cameraActive, setCameraActive] = useState(false);

  const readerRef = useRef<any>(null);
  const controlsRef = useRef<any>(null);
  const processingRef = useRef(false);
  const tokenRef = useRef("");
  const toastTimer = useRef<any>(null);

  useEffect(() => {
    const d = getDriverSession();
    if (!d) {
      router.replace("/login");
      return;
    }
    setToken(d.token);
    tokenRef.current = d.token;
    setScanned(getBodegaPedidos());
    setTodayCount(getTodayScannedCount());
    setPendingCount(getPendingScans().length);
    if (navigator.onLine && d.token) {
      syncPendingScans(d.token).then((n) => {
        if (n > 0) setPendingCount(0);
      });
    }
    return () => stopCamera();
  }, []);

  function mostrarToast(msg: string, tono: Tono, sub?: string, ms = 2500) {
    clearTimeout(toastTimer.current);
    setToast({ msg, sub, tono });
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }

  async function startCamera() {
    try {
      setCameraActive(true);
      const { BrowserMultiFormatReader, BarcodeFormat } =
        await import("@zxing/browser");
      const { DecodeHintType } = await import("@zxing/library");

      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
      hints.set(DecodeHintType.TRY_HARDER, true);

      readerRef.current = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: 50,
        delayBetweenScanSuccess: 1200,
      });

      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      if (devices.length === 0) {
        setNoCamera(true);
        setCamError("No se encontró cámara en este dispositivo");
        return;
      }

      const backCam =
        devices.find(
          (d) =>
            d.label.toLowerCase().includes("back") ||
            d.label.toLowerCase().includes("rear") ||
            d.label.toLowerCase().includes("trasera") ||
            d.label.toLowerCase().includes("environment"),
        ) ?? devices[devices.length - 1];

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: backCam.deviceId ? { exact: backCam.deviceId } : undefined,
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      controlsRef.current = await readerRef.current.decodeFromStream(
        stream,
        videoRef.current!,
        async (result: any) => {
          if (result && !processingRef.current) {
            processingRef.current = true;
            await handleScannedCode(result.getText());
            setTimeout(() => {
              processingRef.current = false;
            }, 1200);
          }
        },
      );
    } catch (err: any) {
      setNoCamera(true);
      if (err?.name === "NotAllowedError")
        setCamError("Debes permitir el acceso a la cámara para escanear");
      else if (err?.name === "NotFoundError")
        setCamError("No se encontró cámara en este dispositivo");
      else
        setCamError(
          "Error al acceder a la cámara. Intenta recargar la página.",
        );
    }
  }

  function stopCamera() {
    try {
      controlsRef.current?.stop();
      readerRef.current?.reset?.();
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      }
    } catch {}
    setCameraActive(false);
    setNoCamera(false);
  }

  async function handleScannedCode(raw: string) {
    let code = raw.trim();
    try {
      const url = new URL(code);
      code = url.searchParams.get("q") || code;
    } catch {}

    const result = await scanCode(code, tokenRef.current);

    if (result === "SESSION_EXPIRED") {
      stopCamera();
      router.replace("/login");
      return;
    }
    if (result === "OFFLINE") {
      playBeep("error");
      vibrate([100, 50, 100]);
      setPendingCount((p) => p + 1);
      mostrarToast(
        "📵 Sin conexión",
        "error",
        "Guardado para sincronizar",
        3000,
      );
      return;
    }
    if (result === "NOT_FOUND") {
      playBeep("error");
      vibrate([50, 30, 50]);
      mostrarToast(
        "❌ No encontrado en el sistema",
        "error",
        code.length > 40 ? code.slice(0, 40) + "…" : code,
      );
      return;
    }

    const { order, pack } = result;
    const enLista = new Set(getBodegaPedidos().map((o) => o.id));

    // ── Ya estaba en la lista ──
    if (enLista.has(order.id)) {
      playBeep("warn");
      vibrate([50, 30, 50]);
      mostrarToast(
        `⚠️ ${order.orderNumber} ya está en la lista`,
        "warn",
        order.storeName,
      );
      return;
    }

    // ── Estados que no se pueden recepcionar ──
    if (order.status === "CANCELLED") {
      playBeep("error");
      vibrate([100, 50, 100]);
      mostrarToast(
        `🚫 ${order.orderNumber} está CANCELADO`,
        "error",
        `${order.storeName} · no despachar`,
        3500,
      );
      return;
    }
    if (order.status === "IN_TRANSIT") {
      playBeep("warn");
      vibrate([50, 30, 50]);
      mostrarToast(
        `🚚 ${order.orderNumber} ya está en camino`,
        "warn",
        order.storeName,
      );
      return;
    }

    // ── Agregar el pedido + las otras ventas del mismo envío (pack) ──
    const aAgregar = [
      order,
      ...pack.filter(
        (p) =>
          !enLista.has(p.id) &&
          p.status !== "CANCELLED" &&
          p.status !== "IN_TRANSIT",
      ),
    ];
    let updated = getBodegaPedidos();
    for (const o of aAgregar) updated = addBodegaPedido(o);
    setScanned([...updated]);
    setTodayCount(incrementTodayScannedCount());

    const extraPack =
      aAgregar.length > 1 ? ` · 📦 Pack de ${order.packSize} ventas` : "";

    if (order.status === "RECEIVED") {
      playBeep("warn");
      vibrate(120);
      mostrarToast(
        `${order.orderNumber} ya estaba recepcionado`,
        "warn",
        `${order.storeName}${extraPack} · se puede salir a ruta`,
      );
    } else if (order.status === "DELIVERED") {
      playBeep("warn");
      vibrate(120);
      mostrarToast(
        `${order.orderNumber} figura ENTREGADO`,
        "warn",
        `${order.storeName}${extraPack} · revisar antes de recepcionar`,
        3500,
      );
    } else if (order.status === "INCIDENT") {
      playBeep("ok");
      vibrate(150);
      mostrarToast(
        `🔁 ${order.orderNumber} · reintento`,
        "ok",
        `${order.storeName}${extraPack}`,
      );
    } else {
      playBeep("ok");
      vibrate(150);
      mostrarToast(
        `✅ ${order.orderNumber} · ${order.customerName}`,
        "ok",
        `${order.storeName}${extraPack}`,
      );
    }
  }

  function irABodega() {
    stopCamera();
    router.push("/bodega");
  }

  // ── Conteo por tienda para el header ──
  const porTienda = scanned.reduce<Record<string, number>>((acc, o) => {
    const k = o.storeName || "Sin tienda";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  const tiendasOrdenadas = Object.entries(porTienda).sort(
    (a, b) => b[1] - a[1],
  );

  // ── Pantalla de inicio (sin elegir tienda) ──
  if (!cameraActive) {
    return (
      <div
        style={{
          height: "100dvh",
          background: "linear-gradient(160deg, #0B1628 0%, #162544 100%)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "calc(var(--sat, 0px) + 20px) 20px 16px",
            borderBottom: "1px solid rgba(255,255,255,.08)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={() => router.back()}
              style={{
                width: 42,
                height: 42,
                borderRadius: "50%",
                background: "rgba(255,255,255,.1)",
                border: "none",
                color: "white",
                fontSize: 20,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              ←
            </button>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "white" }}>
                Escanear pedidos
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,.4)",
                  marginTop: 2,
                }}
              >
                Escanea todo lo que llegue, de cualquier tienda
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
          >
            <div
              style={{
                padding: "16px",
                background: "rgba(255,255,255,.06)",
                borderRadius: 14,
              }}
            >
              <div style={{ fontSize: 26, fontWeight: 700, color: "#38BDF8" }}>
                {scanned.length}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,.45)",
                  marginTop: 2,
                }}
              >
                En la lista de bodega
              </div>
            </div>
            <div
              style={{
                padding: "16px",
                background: "rgba(255,255,255,.06)",
                borderRadius: 14,
              }}
            >
              <div style={{ fontSize: 26, fontWeight: 700, color: "white" }}>
                {todayCount}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,.45)",
                  marginTop: 2,
                }}
              >
                Escaneados hoy
              </div>
            </div>
          </div>

          {pendingCount > 0 && (
            <div
              style={{
                padding: "12px 16px",
                background: "rgba(252,211,77,.12)",
                border: "1px solid rgba(252,211,77,.3)",
                borderRadius: 12,
                fontSize: 13,
                color: "#FCD34D",
              }}
            >
              📵 {pendingCount} escaneo{pendingCount !== 1 ? "s" : ""} sin
              conexión pendiente{pendingCount !== 1 ? "s" : ""} de sincronizar
            </div>
          )}

          {tiendasOrdenadas.length > 0 && (
            <div
              style={{
                background: "rgba(255,255,255,.04)",
                borderRadius: 14,
                padding: "6px 0",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "rgba(255,255,255,.35)",
                  textTransform: "uppercase",
                  letterSpacing: ".08em",
                  padding: "8px 16px",
                }}
              >
                Por tienda
              </div>
              {tiendasOrdenadas.map(([nombre, n]) => (
                <div
                  key={nombre}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "10px 16px",
                    borderTop: "1px solid rgba(255,255,255,.05)",
                  }}
                >
                  <span style={{ fontSize: 14, color: "rgba(255,255,255,.8)" }}>
                    {nombre}
                  </span>
                  <span
                    style={{ fontSize: 14, fontWeight: 700, color: "white" }}
                  >
                    {n}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          style={{
            padding: "16px 20px",
            paddingBottom: "calc(var(--sab, 0px) + 16px)",
            borderTop: "1px solid rgba(255,255,255,.08)",
            background: "rgba(11,22,40,.95)",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <button
            onClick={startCamera}
            style={{
              width: "100%",
              padding: "18px",
              background: "linear-gradient(135deg, #2563EB, #1D4ED8)",
              border: "none",
              borderRadius: 16,
              fontSize: 16,
              fontWeight: 700,
              color: "white",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              boxShadow: "0 4px 20px rgba(37,99,235,.5)",
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
              <rect x="7" y="7" width="10" height="10" rx="1" />
            </svg>
            Abrir escáner
          </button>
          {scanned.length > 0 && (
            <button
              onClick={irABodega}
              style={{
                width: "100%",
                padding: "14px",
                background: "rgba(255,255,255,.08)",
                border: "1px solid rgba(255,255,255,.15)",
                borderRadius: 14,
                fontSize: 14,
                fontWeight: 600,
                color: "white",
                cursor: "pointer",
              }}
            >
              Ver bodega ({scanned.length}) →
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Pantalla del escáner ──
  return (
    <div
      style={{
        height: "100dvh",
        background: "#000",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          paddingTop: "calc(var(--sat, 0px) + 14px)",
          paddingBottom: 14,
          paddingLeft: 20,
          paddingRight: 20,
          background:
            "linear-gradient(to bottom, rgba(0,0,0,.9) 0%, transparent 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <button
            onClick={() => stopCamera()}
            style={{
              width: 42,
              height: 42,
              borderRadius: "50%",
              background: "rgba(255,255,255,.15)",
              border: "none",
              color: "white",
              fontSize: 20,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ←
          </button>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "white" }}>
              {scanned.length} en bodega
            </div>
            <div
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,.5)",
                marginTop: 2,
              }}
            >
              Hoy: {todayCount}
              {pendingCount > 0 && (
                <span style={{ color: "#FCD34D", marginLeft: 6 }}>
                  · {pendingCount} sin conexión
                </span>
              )}
            </div>
          </div>
          <button
            onClick={irABodega}
            style={{
              padding: "8px 14px",
              background: "#2563EB",
              border: "none",
              borderRadius: 20,
              color: "white",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Bodega →
          </button>
        </div>
        {tiendasOrdenadas.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: 6,
              overflowX: "auto",
              paddingBottom: 2,
            }}
          >
            {tiendasOrdenadas.map(([nombre, n]) => (
              <span
                key={nombre}
                style={{
                  flexShrink: 0,
                  fontSize: 11,
                  padding: "4px 10px",
                  borderRadius: 20,
                  background: "rgba(255,255,255,.15)",
                  color: "white",
                  whiteSpace: "nowrap",
                }}
              >
                {nombre} · <b>{n}</b>
              </span>
            ))}
          </div>
        )}
      </div>

      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <div style={{ position: "relative", width: 260, height: 260 }}>
          {[
            {
              top: 0,
              left: 0,
              borderTop: "3px solid #38BDF8",
              borderLeft: "3px solid #38BDF8",
              borderRadius: "4px 0 0 0",
            },
            {
              top: 0,
              right: 0,
              borderTop: "3px solid #38BDF8",
              borderRight: "3px solid #38BDF8",
              borderRadius: "0 4px 0 0",
            },
            {
              bottom: 0,
              left: 0,
              borderBottom: "3px solid #38BDF8",
              borderLeft: "3px solid #38BDF8",
              borderRadius: "0 0 0 4px",
            },
            {
              bottom: 0,
              right: 0,
              borderBottom: "3px solid #38BDF8",
              borderRight: "3px solid #38BDF8",
              borderRadius: "0 0 4px 0",
            },
          ].map((c, i) => (
            <div
              key={i}
              style={
                { position: "absolute", width: 40, height: 40, ...c } as any
              }
            />
          ))}
          <div
            style={{
              position: "absolute",
              left: 8,
              right: 8,
              height: 2,
              background:
                "linear-gradient(90deg, transparent, #38BDF8, transparent)",
              animation: "scanLine 2s ease-in-out infinite",
              top: "50%",
            }}
          />
        </div>
      </div>

      {toast && (
        <div
          style={{
            position: "absolute",
            top: "46%",
            left: 20,
            right: 20,
            zIndex: 20,
          }}
        >
          <div
            style={{
              background: TOAST_BG[toast.tono],
              borderRadius: 14,
              padding: "12px 18px",
              color: "white",
              textAlign: "center",
              boxShadow: "0 4px 20px rgba(0,0,0,.3)",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700 }}>{toast.msg}</div>
            {toast.sub && (
              <div style={{ fontSize: 12, opacity: 0.9, marginTop: 3 }}>
                {toast.sub}
              </div>
            )}
          </div>
        </div>
      )}

      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          paddingBottom: "calc(var(--sab, 0px) + 16px)",
          paddingTop: 16,
          paddingLeft: 16,
          paddingRight: 16,
          background:
            "linear-gradient(to top, rgba(0,0,0,.95) 0%, transparent 100%)",
        }}
      >
        {scanned.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {[...scanned]
              .reverse()
              .slice(0, 3)
              .map((o) => (
                <div
                  key={o.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "7px 12px",
                    background: "rgba(255,255,255,.1)",
                    borderRadius: 10,
                    marginBottom: 4,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#38BDF8",
                        fontFamily: "monospace",
                      }}
                    >
                      {o.orderNumber}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: "rgba(255,255,255,.6)",
                        marginLeft: 8,
                      }}
                    >
                      {o.storeName}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      color: "rgba(255,255,255,.4)",
                      flexShrink: 0,
                    }}
                  >
                    {o.packKey ? "📦 pack" : `📦 ${o.bultos}`}
                  </span>
                </div>
              ))}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <ManualInput onSearch={handleScannedCode} />
          {scanned.length > 0 && (
            <button
              onClick={irABodega}
              style={{
                width: "100%",
                padding: "15px",
                background: "#2563EB",
                border: "none",
                borderRadius: 14,
                fontSize: 15,
                fontWeight: 600,
                color: "white",
                cursor: "pointer",
              }}
            >
              Ver bodega ({scanned.length}) →
            </button>
          )}
        </div>
      </div>

      {noCamera && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "#0B1628",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 32,
            gap: 16,
            zIndex: 20,
          }}
        >
          <div style={{ fontSize: 56 }}>📷</div>
          <div
            style={{
              fontSize: 17,
              fontWeight: 600,
              color: "white",
              textAlign: "center",
            }}
          >
            Sin acceso a la cámara
          </div>
          <div
            style={{
              fontSize: 14,
              color: "rgba(255,255,255,.5)",
              textAlign: "center",
              lineHeight: 1.5,
            }}
          >
            {camError}
          </div>
          <div style={{ width: "100%", maxWidth: 320, marginTop: 8 }}>
            <ManualInput onSearch={handleScannedCode} />
          </div>
          <button
            onClick={() => stopCamera()}
            style={{
              marginTop: 8,
              padding: "10px 18px",
              background: "rgba(255,255,255,.1)",
              border: "none",
              borderRadius: 10,
              color: "white",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Volver
          </button>
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
  );
}

function ManualInput({ onSearch }: { onSearch: (code: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <div style={{ display: "flex", gap: 8, width: "100%" }}>
      <input
        value={val}
        onChange={(e) => setVal(e.target.value.toUpperCase())}
        placeholder="Código manual (N° pedido o envío)"
        autoCapitalize="characters"
        style={{
          flex: 1,
          minWidth: 0,
          padding: "13px 14px",
          borderRadius: 12,
          fontSize: 14,
          border: "1px solid rgba(255,255,255,.2)",
          background: "rgba(255,255,255,.1)",
          color: "white",
          outline: "none",
          fontFamily: "monospace",
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && val) {
            onSearch(val);
            setVal("");
          }
        }}
      />
      <button
        onClick={() => {
          if (val) {
            onSearch(val);
            setVal("");
          }
        }}
        style={{
          padding: "13px 18px",
          background: "#2563EB",
          color: "white",
          border: "none",
          borderRadius: 12,
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        OK
      </button>
    </div>
  );
}
