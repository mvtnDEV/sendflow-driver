'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getDriverSession } from '@/store'

export default function RootPage() {
  const router = useRouter()
  useEffect(() => {
    const session = getDriverSession()
    router.replace(session ? '/pedidos' : '/login')
  }, [])
  return (
    <div style={{ height:'100dvh', background:'#0B1628', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ width:48, height:48, borderRadius:12, background:'#2563EB', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <svg width="26" height="26" viewBox="0 0 16 16" fill="white"><path d="M8 1L1 5v6l7 4 7-4V5L8 1zm0 2.2L13 6l-5 2.8L3 6l5-2.8zM2 7.2l5 2.8v4.6L2 11.8V7.2zm6 7.4V9.8l5-2.8v4.6L8 14.6z"/></svg>
      </div>
    </div>
  )
}
