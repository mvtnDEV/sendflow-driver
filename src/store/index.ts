'use client'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type OrderStatus = 'PENDING' | 'RECEIVED' | 'IN_TRANSIT' | 'DELIVERED' | 'INCIDENT' | 'CANCELLED'
export type Platform    = 'SHOPIFY' | 'WOOCOMMERCE' | 'JUMPSELLER' | 'MERCADOLIBRE' | 'MANUAL'

export interface OrderEvent {
  status:    OrderStatus
  note:      string
  createdAt: string
  createdBy?: string
}

export interface Order {
  id:            string
  orderNumber:   string
  storeId:       string
  storeName?:    string
  platform:      Platform
  customerName:  string
  customerPhone: string
  customerEmail: string
  addressStreet: string
  addressComuna: string
  addressRegion: string
  addressNotes:  string
  bultos:        number
  weightKg:      number
  status:        OrderStatus
  qrCode:        string
  createdAt:     string
  receivedAt:    string
  inTransitAt:   string
  deliveredAt:   string
  events:        OrderEvent[]
  evidencePhoto1?: string
  evidencePhoto2?: string
  evidenceNote?:   string
  store?: { name: string }
}

export interface Driver {
  id:    string
  name:  string
  token: string
}

// ─── API Base URL ─────────────────────────────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_URL || 'https://sendflow-eta.vercel.app'

// ─── localStorage helpers ─────────────────────────────────────────────────────

function load<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback }
  catch { return fallback }
}
function save(key: string, val: any) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(key, JSON.stringify(val)) }
  catch { /* storage lleno */ }
}

// ─── Sesión del conductor ─────────────────────────────────────────────────────

export function getDriverSession(): (Driver & { pin?: string }) | null {
  return load<Driver | null>('sf_driver_session', null)
}
export function setDriverSession(driver: Driver) {
  save('sf_driver_session', driver)
}
export function clearDriverSession() {
  if (typeof window !== 'undefined') localStorage.removeItem('sf_driver_session')
}

// ─── Caché de tiendas (TTL 1 hora) ───────────────────────────────────────────

const STORES_CACHE_KEY = 'sf_stores_cache'
const STORES_TTL       = 3600000 // 1 hora en ms

function getStoredStores(): { id: string; name: string }[] | null {
  try {
    const raw = localStorage.getItem(STORES_CACHE_KEY)
    if (!raw) return null
    const { data, timestamp } = JSON.parse(raw)
    if (Date.now() - timestamp > STORES_TTL) return null
    return data
  } catch { return null }
}

function saveStoresToCache(stores: { id: string; name: string }[]) {
  save(STORES_CACHE_KEY, { data: stores, timestamp: Date.now() })
}

// ─── Contador de escaneos del día ─────────────────────────────────────────────

export function getTodayScannedCount(): number {
  const today = new Date().toLocaleDateString('es-CL')
  return load<number>(`sf_scanned_${today}`, 0)
}

export function incrementTodayScannedCount() {
  const today = new Date().toLocaleDateString('es-CL')
  const key   = `sf_scanned_${today}`
  const count = load<number>(key, 0) + 1
  save(key, count)
  return count
}

// ─── Escaneos pendientes (modo offline) ───────────────────────────────────────

const PENDING_KEY = 'sf_pending_scans'

export interface PendingScan {
  qrCode:    string
  timestamp: number
}

export function getPendingScans(): PendingScan[] {
  return load<PendingScan[]>(PENDING_KEY, [])
}

export function addPendingScan(qrCode: string) {
  const pending = getPendingScans()
  pending.push({ qrCode, timestamp: Date.now() })
  save(PENDING_KEY, pending)
}

export function clearPendingScans() {
  if (typeof window !== 'undefined') localStorage.removeItem(PENDING_KEY)
}

export async function syncPendingScans(token: string): Promise<number> {
  const pending = getPendingScans()
  if (!pending.length) return 0
  let synced = 0
  for (const scan of pending) {
    try {
      const res = await fetch(`${API}/api/driver/scan?q=${encodeURIComponent(scan.qrCode)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) synced++
    } catch { /* skip */ }
  }
  if (synced > 0) clearPendingScans()
  return synced
}

// ─── Compresión de imágenes ───────────────────────────────────────────────────

export async function compressImage(file: File, maxSize = 1200, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ratio  = Math.min(maxSize / img.width, maxSize / img.height, 1)
        canvas.width  = Math.round(img.width  * ratio)
        canvas.height = Math.round(img.height * ratio)
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = reject
      img.src = e.target?.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ─── Vibración háptica ────────────────────────────────────────────────────────

export function vibrate(pattern: number | number[] = 100) {
  if (typeof window !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(pattern)
  }
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function fetchDrivers(): Promise<{ id: string; name: string }[]> {
  try {
    const res = await fetch(`${API}/api/driver/list`)
    const data = await res.json()
    if (data.ok) return data.data
    return []
  } catch { return [] }
}

export async function loginWithPinApi(driverId: string, pin: string): Promise<Driver | null> {
  try {
    const res = await fetch(`${API}/api/driver/auth`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ driverId, pin }),
    })
    const data = await res.json()
    if (!data.ok) return null
    const driver: Driver = {
      id:    data.data.driver.id,
      name:  data.data.driver.name,
      token: data.data.token,
    }
    setDriverSession(driver)
    return driver
  } catch { return null }
}

// ─── Pedidos ──────────────────────────────────────────────────────────────────

export async function fetchDriverOrders(token: string): Promise<Order[]> {
  try {
    const res = await fetch(`${API}/api/driver/orders`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (!data.ok) return []
    return data.data.map((o: any) => ({
      ...o,
      storeName:     o.store?.name       ?? '',
      addressNotes:  o.addressNotes      ?? '',
      customerPhone: o.customerPhone     ?? '',
      customerEmail: o.customerEmail     ?? '',
    }))
  } catch { return [] }
}

export async function fetchOrderByQr(qrCode: string, token: string): Promise<Order | null> {
  try {
    const res = await fetch(`${API}/api/driver/scan?q=${encodeURIComponent(qrCode)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (!data.ok) return null
    return {
      ...data.data,
      storeName:    data.data.store?.name ?? '',
      addressNotes: data.data.addressNotes ?? '',
    }
  } catch {
    // Modo offline — guardar para sincronizar después
    addPendingScan(qrCode)
    return null
  }
}

export async function updateOrderStatus(
  orderId: string,
  status:  OrderStatus,
  token:   string,
  note?:   string,
): Promise<Order | null> {
  try {
    const res = await fetch(`${API}/api/driver/orders`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ orderId, status, note }),
    })
    const data = await res.json()
    return data.ok ? data.data : null
  } catch { return null }
}

export async function saveEvidence(
  orderId:       string,
  photo1:        string,
  photo2:        string | null,
  note:          string,
  token:         string,
  markDelivered: boolean,
): Promise<boolean> {
  try {
    const res = await fetch(`${API}/api/driver/evidence`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ orderId, photo1, photo2, note, markDelivered }),
    })
    const data = await res.json()
    return data.ok
  } catch { return false }
}

// ─── Tiendas con caché ────────────────────────────────────────────────────────

export async function fetchStores(token: string): Promise<{ id: string; name: string } [] | 'SESSION_EXPIRED'> {
  const cached = getStoredStores()
  if (cached) return cached

  try {
    const res = await fetch(`${API}/api/driver/stores`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    // Token expirado o no autorizado — sesión inválida
    if (res.status === 401) {
      clearDriverSession()
      if (typeof window !== 'undefined') localStorage.removeItem(STORES_CACHE_KEY)
      return 'SESSION_EXPIRED'
    }

    const data = await res.json()
    if (data.ok) {
      saveStoresToCache(data.data)
      return data.data
    }
    return []
  } catch { return [] }
}

// ─── Labels ───────────────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING:    'Pendiente',
  RECEIVED:   'Recepcionado',
  IN_TRANSIT: 'En camino',
  DELIVERED:  'Entregado',
  INCIDENT:   'Incidencia',
  CANCELLED:  'Cancelado',
}

export const STATUS_COLOR: Record<OrderStatus, { bg: string; color: string }> = {
  PENDING:    { bg: '#FFFBEB', color: '#92400E' },
  RECEIVED:   { bg: '#EFF6FF', color: '#1D4ED8' },
  IN_TRANSIT: { bg: '#F0FDF4', color: '#166534' },
  DELIVERED:  { bg: '#F5F3FF', color: '#5B21B6' },
  INCIDENT:   { bg: '#FFF1F2', color: '#9F1239' },
  CANCELLED:  { bg: '#F1F5F9', color: '#475569' },
}

export const STATUS_BG_FULL: Record<OrderStatus, { bg: string; text: string }> = {
  PENDING:    { bg: '#F59E0B', text: 'white' },
  RECEIVED:   { bg: '#2563EB', text: 'white' },
  IN_TRANSIT: { bg: '#16A34A', text: 'white' },
  DELIVERED:  { bg: '#7C3AED', text: 'white' },
  INCIDENT:   { bg: '#DC2626', text: 'white' },
  CANCELLED:  { bg: '#6B7280', text: 'white' },
}

// ─── Recepción en batch ───────────────────────────────────────────────────────

export interface ScannedOrder {
  id:            string
  orderNumber:   string
  customerName:  string
  addressStreet: string
  addressComuna: string
  storeName:     string
  bultos:        number
  status:        OrderStatus
}

const BODEGA_KEY = 'sf_bodega_pedidos'

export function getBodegaPedidos(): ScannedOrder[] {
  return load<ScannedOrder[]>(BODEGA_KEY, [])
}

export function addBodegaPedido(order: ScannedOrder) {
  const current = getBodegaPedidos()
  const exists  = current.find(o => o.id === order.id)
  if (exists) return current
  const updated = [...current, order]
  save(BODEGA_KEY, updated)
  return updated
}

export function removeBodegaPedido(id: string) {
  const updated = getBodegaPedidos().filter(o => o.id !== id)
  save(BODEGA_KEY, updated)
  return updated
}

export function clearBodegaPedidos() {
  if (typeof window !== 'undefined') localStorage.removeItem(BODEGA_KEY)
}

export async function recepcionarBatch(
  orderIds: string[],
  token:    string,
): Promise<{ ok: boolean; updated: number }> {
  try {
    const res = await fetch(`${API}/api/driver/batch-receive`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ orderIds }),
    })
    const data = await res.json()
    return { ok: data.ok, updated: data.updated ?? 0 }
  } catch { return { ok: false, updated: 0 } }
}

export async function salirARuta(
  orderIds: string[],
  token:    string,
): Promise<{ ok: boolean; updated: number }> {
  try {
    const res = await fetch(`${API}/api/driver/salir-ruta`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ orderIds }),
    })
    const data = await res.json()
    return { ok: data.ok, updated: data.updated ?? 0 }
  } catch { return { ok: false, updated: 0 } }
}
