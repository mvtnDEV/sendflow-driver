"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getDriverSession,
  getBodegaPedidos,
  removeBodegaPedido,
  removeBodegaPedidos,
  clearBodegaPedidos,
  setBodegaStatus,
  recepcionarBatch,
  salirARuta,
  type ScannedOrder,
} from "@/store";

type Accion = null | "recepcionando" | "saliendo";

const POR_RECEPCIONAR = new Set(["PENDING", "INCIDENT", "DELIVERED"]);

export default function BodegaPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [pedidos, setPedidos] = useState<ScannedOrder[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const [accion, setAccion] = useState<Accion>(null);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);

  useEffect(() => {
    const d = getDriverSession();
    if (!d) {
      router.replace("/login");
      return;
    }
    setToken(d.token);
    const lista = getBodegaPedidos();
    setPedidos(lista);
    setSelected(new Set(lista.map((p) => p.id))); // por defecto: todo seleccionado
  }, []);

  // ── Agrupar por tienda ──
  const grupos = useMemo(() => {
    const map = new Map<string, ScannedOrder[]>();
    for (const p of pedidos) {
      const k = p.storeName || "Sin tienda";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [pedidos]);

  const seleccionados = pedidos.filter((p) => selected.has(p.id));
  const aRecepcionar = seleccionados.filter((p) =>
    POR_RECEPCIONAR.has(p.status),
  );
  const aRuta = seleccionados.filter((p) => p.status === "RECEIVED");
  const totalRecepcionar = pedidos.filter((p) =>
    POR_RECEPCIONAR.has(p.status),
  ).length;
  const totalRecibidos = pedidos.filter((p) => p.status === "RECEIVED").length;

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function toggleTienda(items: ScannedOrder[]) {
    const todos = items.every((p) => selected.has(p.id));
    setSelected((s) => {
      const n = new Set(s);
      items.forEach((p) => (todos ? n.delete(p.id) : n.add(p.id)));
      return n;
    });
  }
  function toggleAbierta(tienda: string) {
    setAbiertas((s) => {
      const n = new Set(s);
      n.has(tienda) ? n.delete(tienda) : n.add(tienda);
      return n;
    });
  }
  function seleccionarTodo(v: boolean) {
    setSelected(v ? new Set(pedidos.map((p) => p.id)) : new Set());
  }

  function quitar(id: string) {
    const updated = removeBodegaPedido(id);
    setPedidos([...updated]);
    setSelected((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  }

  function limpiarLista() {
    if (
      !confirm(
        "¿Limpiar la lista? Solo borra los pedidos de la pantalla, no cambia ningún estado en el sistema.",
      )
    )
      return;
    clearBodegaPedidos();
    setPedidos([]);
    setSelected(new Set());
    setMsg(null);
  }

  async function handleRecepcionar() {
    if (aRecepcionar.length === 0) return;
    const hayEntregados = aRecepcionar.filter(
      (p) => p.status === "DELIVERED",
    ).length;
    if (
      hayEntregados > 0 &&
      !confirm(
        `${hayEntregados} pedido(s) figuran ENTREGADOS. ¿Recepcionarlos igual?`,
      )
    )
      return;

    setAccion("recepcionando");
    setMsg(null);
    const ids = aRecepcionar.map((p) => p.id);
    const result = await recepcionarBatch(ids, token);
    setAccion(null);

    if (result.ok) {
      const updated = setBodegaStatus(ids, "RECEIVED");
      setPedidos([...updated]);
      setMsg({
        texto: `✅ ${result.updated} pedido${result.updated !== 1 ? "s" : ""} recepcionado${result.updated !== 1 ? "s" : ""}`,
        ok: true,
      });
    } else {
      setMsg({
        texto:
          "❌ Error al recepcionar. Revisa la conexión e intenta de nuevo.",
        ok: false,
      });
    }
  }

  async function handleSalirARuta() {
    if (aRuta.length === 0) return;
    if (
      !confirm(
        `¿Poner ${aRuta.length} pedido${aRuta.length !== 1 ? "s" : ""} en camino?`,
      )
    )
      return;

    setAccion("saliendo");
    setMsg(null);
    const ids = aRuta.map((p) => p.id);
    const result = await salirARuta(ids, token);
    setAccion(null);

    if (result.ok) {
      const updated = removeBodegaPedidos(ids);
      setPedidos([...updated]);
      setSelected((s) => {
        const n = new Set(s);
        ids.forEach((id) => n.delete(id));
        return n;
      });
      setMsg({
        texto: `🚚 ${result.updated} pedido${result.updated !== 1 ? "s" : ""} en camino`,
        ok: true,
      });
      if (updated.length === 0)
        setTimeout(() => router.replace("/pedidos"), 2000);
    } else {
      setMsg({
        texto: "❌ Error al salir a ruta. Intenta de nuevo.",
        ok: false,
      });
    }
  }

  const ocupado = accion !== null;

  return (
    <div
      style={{
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        background: "#F0F4F8",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "#0B1628",
          paddingTop: "calc(var(--sat) + 16px)",
          paddingBottom: 14,
          paddingLeft: 20,
          paddingRight: 20,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => router.back()}
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: "rgba(255,255,255,.1)",
              border: "none",
              color: "white",
              fontSize: 18,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ←
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "white" }}>
              Bodega
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.45)" }}>
              {pedidos.length} pedido{pedidos.length !== 1 ? "s" : ""} ·{" "}
              {grupos.length} tienda{grupos.length !== 1 ? "s" : ""}
            </div>
          </div>
          {pedidos.length > 0 && !ocupado && (
            <button
              onClick={limpiarLista}
              style={{
                padding: "6px 12px",
                background: "rgba(255,255,255,.1)",
                border: "1px solid rgba(255,255,255,.15)",
                borderRadius: 8,
                color: "rgba(255,255,255,.7)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              🗑 Limpiar
            </button>
          )}
        </div>

        {pedidos.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              marginTop: 12,
            }}
          >
            <div
              style={{
                background: "rgba(245,158,11,.15)",
                borderRadius: 10,
                padding: "8px 12px",
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 700, color: "#FCD34D" }}>
                {totalRecepcionar}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.6)" }}>
                Por recepcionar
              </div>
            </div>
            <div
              style={{
                background: "rgba(37,99,235,.2)",
                borderRadius: 10,
                padding: "8px 12px",
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 700, color: "#93C5FD" }}>
                {totalRecibidos}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.6)" }}>
                Listos para ruta
              </div>
            </div>
          </div>
        )}
      </div>

      {msg && (
        <div
          style={{
            margin: "12px 16px 0",
            padding: "12px 16px",
            background: msg.ok ? "#F0FDF4" : "#FEF2F2",
            borderRadius: 12,
            border: `1px solid ${msg.ok ? "#BBF7D0" : "#FECACA"}`,
            fontSize: 14,
            fontWeight: 500,
            color: msg.ok ? "#166534" : "#B91C1C",
            textAlign: "center",
          }}
        >
          {msg.texto}
        </div>
      )}

      {pedidos.length > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 16px 0",
          }}
        >
          <span style={{ fontSize: 12, color: "#64748B" }}>
            {seleccionados.length} seleccionado
            {seleccionados.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={() =>
              seleccionarTodo(seleccionados.length !== pedidos.length)
            }
            disabled={ocupado}
            style={{
              fontSize: 12,
              color: "#2563EB",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {seleccionados.length === pedidos.length
              ? "Quitar selección"
              : "Seleccionar todo"}
          </button>
        </div>
      )}

      {/* Lista agrupada por tienda */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "10px 16px",
          paddingBottom: "calc(var(--sab) + 170px)",
        }}
      >
        {pedidos.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 500,
                color: "#374151",
                marginBottom: 8,
              }}
            >
              Sin pedidos escaneados
            </div>
            <div style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 20 }}>
              Escanea pedidos primero
            </div>
            <button
              onClick={() => router.push("/escanear")}
              style={{
                padding: "12px 24px",
                background: "#2563EB",
                color: "white",
                border: "none",
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Ir a escanear
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {grupos.map(([tienda, items]) => {
              const todos = items.every((p) => selected.has(p.id));
              const algunos = !todos && items.some((p) => selected.has(p.id));
              const abierta = abiertas.has(tienda);
              const pendientes = items.filter((p) =>
                POR_RECEPCIONAR.has(p.status),
              ).length;
              const recibidos = items.filter(
                (p) => p.status === "RECEIVED",
              ).length;
              const bultos = items.reduce((s, p) => s + (p.bultos || 1), 0);

              return (
                <div
                  key={tienda}
                  style={{
                    background: "white",
                    borderRadius: 14,
                    border: "1px solid #E2E8F0",
                    overflow: "hidden",
                  }}
                >
                  {/* Cabecera de tienda */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 14px",
                    }}
                  >
                    <button
                      onClick={() => toggleTienda(items)}
                      disabled={ocupado}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 8,
                        flexShrink: 0,
                        cursor: "pointer",
                        border: todos || algunos ? "none" : "2px solid #CBD5E1",
                        background: todos
                          ? "#2563EB"
                          : algunos
                            ? "#93C5FD"
                            : "white",
                        color: "white",
                        fontSize: 14,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {todos ? "✓" : algunos ? "–" : ""}
                    </button>
                    <div
                      onClick={() => toggleAbierta(tienda)}
                      style={{ flex: 1, cursor: "pointer", minWidth: 0 }}
                    >
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 700,
                          color: "#0F172A",
                        }}
                      >
                        {tienda}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          marginTop: 4,
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 11,
                            background: "#F1F5F9",
                            color: "#475569",
                            padding: "2px 8px",
                            borderRadius: 20,
                          }}
                        >
                          {items.length} pedido{items.length !== 1 ? "s" : ""} ·{" "}
                          {bultos} bulto{bultos !== 1 ? "s" : ""}
                        </span>
                        {pendientes > 0 && (
                          <span
                            style={{
                              fontSize: 11,
                              background: "#FFFBEB",
                              color: "#92400E",
                              padding: "2px 8px",
                              borderRadius: 20,
                            }}
                          >
                            {pendientes} por recepcionar
                          </span>
                        )}
                        {recibidos > 0 && (
                          <span
                            style={{
                              fontSize: 11,
                              background: "#EFF6FF",
                              color: "#1D4ED8",
                              padding: "2px 8px",
                              borderRadius: 20,
                            }}
                          >
                            {recibidos} listos
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleAbierta(tienda)}
                      style={{
                        background: "none",
                        border: "none",
                        fontSize: 14,
                        color: "#94A3B8",
                        cursor: "pointer",
                        transform: abierta ? "rotate(180deg)" : "none",
                        transition: "transform .15s",
                      }}
                    >
                      ▼
                    </button>
                  </div>

                  {/* Pedidos de la tienda */}
                  {abierta &&
                    items.map((p) => (
                      <div
                        key={p.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "10px 14px",
                          borderTop: "1px solid #F1F5F9",
                        }}
                      >
                        <button
                          onClick={() => toggle(p.id)}
                          disabled={ocupado}
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 6,
                            flexShrink: 0,
                            cursor: "pointer",
                            border: selected.has(p.id)
                              ? "none"
                              : "2px solid #CBD5E1",
                            background: selected.has(p.id)
                              ? "#2563EB"
                              : "white",
                            color: "white",
                            fontSize: 12,
                            fontWeight: 700,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {selected.has(p.id) ? "✓" : ""}
                        </button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: 700,
                                color: "#1D4ED8",
                                fontFamily: "monospace",
                              }}
                            >
                              {p.orderNumber}
                            </span>
                            <EstadoBadge status={p.status} />
                            {p.packKey && (
                              <span
                                style={{
                                  fontSize: 10,
                                  background: "#F5F3FF",
                                  color: "#6D28D9",
                                  padding: "1px 6px",
                                  borderRadius: 20,
                                }}
                              >
                                📦 pack {p.packSize}
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: 13,
                              color: "#111",
                              marginTop: 2,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {p.customerName}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "#6B7280",
                              marginTop: 1,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {p.addressStreet}, {p.addressComuna}
                          </div>
                        </div>
                        {!ocupado && (
                          <button
                            onClick={() => quitar(p.id)}
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: "50%",
                              background: "#FFF1F2",
                              border: "1px solid #FECDD3",
                              color: "#9F1239",
                              fontSize: 15,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Acciones */}
      {pedidos.length > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            background: "white",
            borderTop: "1px solid #E2E8F0",
            padding: "14px 16px calc(var(--sab) + 14px)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {accion === "recepcionando" && (
            <div
              style={{
                padding: "14px",
                background: "#EFF6FF",
                borderRadius: 12,
                fontSize: 14,
                color: "#1D4ED8",
                textAlign: "center",
                fontWeight: 600,
              }}
            >
              Recepcionando…
            </div>
          )}
          {accion === "saliendo" && (
            <div
              style={{
                padding: "14px",
                background: "#F0FDF4",
                borderRadius: 12,
                fontSize: 14,
                color: "#166534",
                textAlign: "center",
                fontWeight: 600,
              }}
            >
              Poniendo en camino…
            </div>
          )}
          {!ocupado && (
            <>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => router.push("/escanear")}
                  style={{
                    flex: 1,
                    padding: "13px",
                    background: "#F1F5F9",
                    border: "1px solid #E2E8F0",
                    borderRadius: 12,
                    fontSize: 14,
                    fontWeight: 500,
                    color: "#374151",
                    cursor: "pointer",
                  }}
                >
                  + Escanear
                </button>
                <button
                  onClick={handleRecepcionar}
                  disabled={aRecepcionar.length === 0}
                  style={{
                    flex: 2,
                    padding: "13px",
                    background: aRecepcionar.length ? "#2563EB" : "#CBD5E1",
                    border: "none",
                    borderRadius: 12,
                    fontSize: 14,
                    fontWeight: 700,
                    color: "white",
                    cursor: aRecepcionar.length ? "pointer" : "not-allowed",
                  }}
                >
                  📥 Recepcionar {aRecepcionar.length || ""}
                </button>
              </div>
              <button
                onClick={handleSalirARuta}
                disabled={aRuta.length === 0}
                style={{
                  padding: "15px",
                  background: aRuta.length ? "#16A34A" : "#E2E8F0",
                  border: "none",
                  borderRadius: 12,
                  fontSize: 15,
                  fontWeight: 700,
                  color: aRuta.length ? "white" : "#94A3B8",
                  cursor: aRuta.length ? "pointer" : "not-allowed",
                }}
              >
                🚚 Salir a ruta {aRuta.length ? `(${aRuta.length})` : ""}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function EstadoBadge({ status }: { status: string }) {
  const map: Record<string, { t: string; bg: string; c: string }> = {
    PENDING: { t: "Nuevo", bg: "#FFFBEB", c: "#92400E" },
    INCIDENT: { t: "Reintento", bg: "#FFF1F2", c: "#9F1239" },
    DELIVERED: { t: "Fig. entregado", bg: "#F5F3FF", c: "#5B21B6" },
    RECEIVED: { t: "Recepcionado", bg: "#EFF6FF", c: "#1D4ED8" },
  };
  const s = map[status];
  if (!s) return null;
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        background: s.bg,
        color: s.c,
        padding: "1px 6px",
        borderRadius: 20,
      }}
    >
      {s.t}
    </span>
  );
}
