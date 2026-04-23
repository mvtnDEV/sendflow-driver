'use client'

// ─── Tipos (espejo del sistema principal) ────────────────────────────────────

export type OrderStatus = 'PENDING' | 'RECEIVED' | 'IN_TRANSIT' | 'DELIVERED' | 'INCIDENT' | 'CANCELLED'
export type Platform    = 'SHOPIFY' | 'WOOCOMMERCE' | 'JUMPSELLER' | 'MERCADOLIBRE' | 'MANUAL'

export interface OrderEvent {
  status: OrderStatus
  note: string
  createdAt: string
  createdBy?: string
}

export interface DeliveryEvidence {
  photo1: string
  photo2: string
  note: string
  capturedAt: string
}

export interface Order {
  id: string
  orderNumber: string
  externalId?: string
  storeId: string
  storeName: string
  platform: Platform
  customerName: string
  customerPhone: string
  customerEmail: string
  addressStreet: string
  addressComuna: string
  addressRegion: string
  addressNotes: string
  bultos: number
  weightKg: number
  status: OrderStatus
  qrCode: string
  qrDataUrl?: string
  createdAt: string
  receivedAt: string
  inTransitAt: string
  deliveredAt: string
  events: OrderEvent[]
  evidence?: DeliveryEvidence
  // Campo extra para el conductor
  driverId?: string
}

export interface Driver {
  id: string
  name: string
  pin: string       // 4 dígitos
  phone: string
  isActive: boolean
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

function load<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback }
  catch { return fallback }
}
function save(key: string, val: any) {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, JSON.stringify(val))
}

// ─── QR Code generator ───────────────────────────────────────────────────────

export async function generateQRDataUrl(code: string, baseUrl = ''): Promise<string> {
  const url = baseUrl
    ? `${baseUrl}/escanear?q=${code}`
    : `http://localhost:3001/escanear?q=${code}`
  const QRCode = (await import('qrcode')).default
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 200,
    color: { dark: '#0B1628', light: '#FFFFFF' },
  })
}


// ─── Sesión del conductor ────────────────────────────────────────────────────

export function getDriverSession(): Driver | null {
  return load<Driver | null>('sf_driver_session', null)
}
export function setDriverSession(driver: Driver) {
  save('sf_driver_session', driver)
}
export function clearDriverSession() {
  localStorage.removeItem('sf_driver_session')
}

// ─── Conductores registrados ─────────────────────────────────────────────────
// En demo los conductores están hardcodeados.
// En producción vendrían de la DB del sistema principal.

const DEFAULT_DRIVERS: Driver[] = [
  { id: 'drv_1', name: 'Carlos Muñoz',    pin: '1234', phone: '+56912345678', isActive: true },
  { id: 'drv_2', name: 'Pedro Soto',      pin: '2222', phone: '+56987654321', isActive: true },
  { id: 'drv_3', name: 'Andrea Romero',   pin: '3333', phone: '+56911111111', isActive: true },
  { id: 'drv_4', name: 'Luis Hernández',  pin: '4444', phone: '+56922222222', isActive: true },
]

export function getDrivers(): Driver[] {
  const stored = load<Driver[]>('sf_drivers', [])
  return stored.length > 0 ? stored : DEFAULT_DRIVERS
}

export function loginWithPin(pin: string): Driver | null {
  const drivers = getDrivers()
  const driver  = drivers.find(d => d.pin === pin && d.isActive)
  if (!driver) return null
  setDriverSession(driver)
  return driver
}

// ─── Pedidos (lee del mismo localStorage que el sistema principal) ───────────

export function getAllOrders(): Order[] {
  return load<Order[]>('sf_orders', [])
}

export function getOrderById(id: string): Order | undefined {
  return getAllOrders().find(o => o.id === id || o.qrCode === id)
}

// Pedidos del día asignados a este conductor (o sin asignar)
export function getDriverOrders(driverId: string): Order[] {
  const all   = getAllOrders()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return all
    .filter(o => {
      // Mostrar pedidos de hoy que no estén cancelados ni entregados,
      // O que estén entregados hoy mismo por este conductor
      const created = new Date(o.createdAt)
      const isToday = created >= today

      const isAssigned   = !o.driverId || o.driverId === driverId
      const isActive     = ['PENDING','RECEIVED','IN_TRANSIT','INCIDENT'].includes(o.status)
      const isDelivToday = o.status === 'DELIVERED' && o.deliveredAt &&
        new Date(o.deliveredAt) >= today && o.driverId === driverId

      return isAssigned && (isActive || isDelivToday)
    })
    .sort((a, b) => {
      // Ordenar: EN_CAMINO primero, luego RECEIVED, luego PENDING
      const priority: Record<OrderStatus, number> = {
        IN_TRANSIT: 0, RECEIVED: 1, PENDING: 2,
        INCIDENT: 3, DELIVERED: 4, CANCELLED: 5,
      }
      return (priority[a.status] ?? 9) - (priority[b.status] ?? 9)
    })
}

// ─── Actualizar pedido (escribe en el mismo localStorage) ────────────────────

function saveOrders(orders: Order[]) { save('sf_orders', orders) }

export function driverUpdateStatus(
  orderId:  string,
  status:   OrderStatus,
  driverId: string,
  driverName: string,
  note?:    string,
): Order | null {
  const orders = getAllOrders()
  const idx    = orders.findIndex(o => o.id === orderId)
  if (idx === -1) return null

  const now   = new Date().toISOString()
  const order = { ...orders[idx], status, driverId }

  if (status === 'RECEIVED')   order.receivedAt   = now
  if (status === 'IN_TRANSIT') order.inTransitAt  = now
  if (status === 'DELIVERED')  order.deliveredAt  = now

  const noteMap: Record<OrderStatus, string> = {
    PENDING: 'Pendiente', RECEIVED: 'Recepcionado en bodega',
    IN_TRANSIT: 'Salió a ruta', DELIVERED: 'Entregado al cliente',
    INCIDENT: 'Incidencia reportada', CANCELLED: 'Cancelado',
  }

  order.events = [
    ...order.events,
    {
      status,
      note:      note || noteMap[status],
      createdAt: now,
      createdBy: `conductor:${driverName}`,
    },
  ]

  orders[idx] = order
  saveOrders(orders)
  return order
}

export function driverSaveEvidence(
  orderId:  string,
  evidence: DeliveryEvidence,
): Order | null {
  const orders = getAllOrders()
  const idx    = orders.findIndex(o => o.id === orderId)
  if (idx === -1) return null
  orders[idx] = { ...orders[idx], evidence }
  saveOrders(orders)
  return orders[idx]
}

// ─── Labels ───────────────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Pendiente', RECEIVED: 'Recepcionado',
  IN_TRANSIT: 'En camino', DELIVERED: 'Entregado',
  INCIDENT: 'Incidencia', CANCELLED: 'Cancelado',
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

// ─── Seed de datos demo ───────────────────────────────────────────────────────
// Carga pedidos de prueba en el localStorage del dispositivo
// para poder probar la app sin el sistema principal

export function seedDemoOrders(): { created: number; qrCodes: string[] } {
  const existing = getAllOrders()
  if (existing.length > 0) return { created: 0, qrCodes: existing.map(o => o.id) }

  const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  function makeCode(): string {
    const now = new Date()
    const yy   = String(now.getFullYear()).slice(2)
    const mm   = String(now.getMonth() + 1).padStart(2, '0')
    const rand = Array.from({ length: 4 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('')
    return `SF-${yy}${mm}-${rand}`
  }

  const now = new Date().toISOString()

  const demos: Order[] = [
    {
      id: makeCode(), orderNumber: '#SH-00001', storeId: 's1', storeName: 'Mi Tienda',
      platform: 'SHOPIFY', externalId: '1001',
      customerName: 'María González', customerPhone: '+56912345678', customerEmail: 'maria@email.com',
      addressStreet: 'Av. Providencia 1234', addressComuna: 'Providencia', addressRegion: 'Metropolitana', addressNotes: 'Timbre 3B',
      bultos: 2, weightKg: 1.5, status: 'PENDING',
      qrCode: '', receivedAt: '', inTransitAt: '', deliveredAt: '',
      createdAt: now, events: [{ status: 'PENDING', note: 'Pedido creado', createdAt: now }],
    },
    {
      id: makeCode(), orderNumber: '#SH-00002', storeId: 's1', storeName: 'Mi Tienda',
      platform: 'SHOPIFY', externalId: '1002',
      customerName: 'Carlos Rodríguez', customerPhone: '+56987654321', customerEmail: '',
      addressStreet: 'Los Leones 456, depto 12', addressComuna: 'Las Condes', addressRegion: 'Metropolitana', addressNotes: '',
      bultos: 1, weightKg: 0.8, status: 'RECEIVED',
      qrCode: '', receivedAt: now, inTransitAt: '', deliveredAt: '',
      createdAt: now, events: [
        { status: 'PENDING',  note: 'Pedido creado',           createdAt: now },
        { status: 'RECEIVED', note: 'Recepcionado en bodega',   createdAt: now },
      ],
    },
    {
      id: makeCode(), orderNumber: '#WC-00001', storeId: 's1', storeName: 'Mi Tienda',
      platform: 'WOOCOMMERCE', externalId: '2001',
      customerName: 'Ana Martínez', customerPhone: '+56922222222', customerEmail: 'ana@email.com',
      addressStreet: 'Irarrázaval 789', addressComuna: 'Ñuñoa', addressRegion: 'Metropolitana', addressNotes: 'Casa verde portón negro',
      bultos: 3, weightKg: 4.2, status: 'IN_TRANSIT',
      qrCode: '', receivedAt: now, inTransitAt: now, deliveredAt: '',
      createdAt: now, events: [
        { status: 'PENDING',    note: 'Pedido creado',    createdAt: now },
        { status: 'RECEIVED',   note: 'En bodega',        createdAt: now },
        { status: 'IN_TRANSIT', note: 'Salió a ruta',     createdAt: now },
      ],
    },
    {
      id: makeCode(), orderNumber: '#JU-00001', storeId: 's1', storeName: 'Mi Tienda',
      platform: 'JUMPSELLER', externalId: '3001',
      customerName: 'Pedro Sánchez', customerPhone: '+56933333333', customerEmail: '',
      addressStreet: 'Gran Avenida 1500', addressComuna: 'San Miguel', addressRegion: 'Metropolitana', addressNotes: '',
      bultos: 1, weightKg: 0.5, status: 'PENDING',
      qrCode: '', receivedAt: '', inTransitAt: '', deliveredAt: '',
      createdAt: now, events: [{ status: 'PENDING', note: 'Pedido creado', createdAt: now }],
    },
  ]

  // El id ES el qrCode
  const withQR = demos.map(o => ({ ...o, qrCode: o.id }))
  save('sf_orders', withQR)

  return { created: withQR.length, qrCodes: withQR.map(o => o.id) }
}

export function clearDemoOrders() {
  localStorage.removeItem('sf_orders')
}
