'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Papa from 'papaparse'
import { supabase } from '../lib/supabase'

export default function Home() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [repairs, setRepairs] = useState<any[]>([])

  const [form, setForm] = useState({
    item_name: '',
    listing_id: '',
    price: '',
    date_sold: '',
    quantity: 1,
    notes: ''
  })

  // --- AUTH GUARD + INITIAL LOAD ---
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        router.push('/login')
        return
      }

      const { data, error } = await supabase
        .from('repairs')
        .select('*')
        .order('date_sold', { ascending: false })

      if (error) console.error('Supabase error:', error.message)
      else setRepairs(data || [])

      setLoading(false)
    }

    init()
  }, [router])

  // --- MANUAL SUBMIT ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const { error } = await supabase.from('repairs').insert([
      {
        ...form,
        price: Number(form.price),
        source: 'manual'
      }
    ])

    if (error) {
      alert(error.message)
      return
    }

    setForm({
      item_name: '',
      listing_id: '',
      price: '',
      date_sold: '',
      quantity: 1,
      notes: ''
    })

    refreshRepairs()
  }

  // --- CSV UPLOAD (robust for eBay) ---
  const handleCSV = (file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = (results.data as any[])
          .map(row => {
            if (!row['Order number'] || !row['Item title'] || !row['Total price']) return null

            return {
              listing_id: row['Order number'], // unique in Supabase
              item_name: row['Item title'],
              price: Number(String(row['Total price']).replace('$','')),
              date_sold: new Date(row['Sale date']).toISOString(),
              quantity: Number(row['Quantity'] || 1),
              source: 'csv'
            }
          })
          .filter(Boolean)

        // Upsert avoids duplicates (based on listing_id)
        const { error } = await supabase
          .from('repairs')
          .upsert(rows, { onConflict: ['listing_id'] })

        if (error) alert(error.message)
        else {
          alert('CSV imported successfully!')
          refreshRepairs()
        }
      }
    })
  }

  // --- REFRESH TABLE ---
  const refreshRepairs = async () => {
    const { data, error } = await supabase
      .from('repairs')
      .select('*')
      .order('date_sold', { ascending: false })

    if (!error) setRepairs(data || [])
  }

  // --- FILTERS ---
  const filterRepairs = async (period: string) => {
    let query = supabase.from('repairs').select('*')
    const now = new Date()

    if (period === 'thisMonth') {
      query = query.gte('date_sold', new Date(now.getFullYear(), now.getMonth(), 1).toISOString())
    }

    if (period === 'lastMonth') {
      query = query
        .gte('date_sold', new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString())
        .lte('date_sold', new Date(now.getFullYear(), now.getMonth(), 0).toISOString())
    }

    if (period === 'thisYear') {
      query = query.gte('date_sold', new Date(now.getFullYear(), 0, 1).toISOString())
    }

    const { data } = await query.order('date_sold', { ascending: false })
    setRepairs(data || [])
  }

  if (loading) return <p className="p-8">Loading…</p>

  return (
    <main className="p-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Repair Log</h1>
        <button
          onClick={async () => {
            await supabase.auth.signOut()
            router.push('/login')
          }}
          className="border px-3 py-1 rounded"
        >
          Logout
        </button>
      </div>

      {/* MANUAL ENTRY */}
      <form onSubmit={handleSubmit} className="space-y-2 mb-6">
        <input className="input" placeholder="Item name"
          value={form.item_name}
          onChange={e => setForm({ ...form, item_name: e.target.value })}
        />
        <input className="input" placeholder="Listing ID"
          value={form.listing_id}
          onChange={e => setForm({ ...form, listing_id: e.target.value })}
        />
        <input className="input" type="number" placeholder="Price"
          value={form.price}
          onChange={e => setForm({ ...form, price: e.target.value })}
        />
        <input className="input" type="date"
          value={form.date_sold}
          onChange={e => setForm({ ...form, date_sold: e.target.value })}
        />
        <textarea className="input" placeholder="Notes"
          value={form.notes}
          onChange={e => setForm({ ...form, notes: e.target.value })}
        />
        <button className="bg-black text-white px-4 py-2 rounded">
          Save Repair
        </button>
      </form>

      {/* CSV UPLOAD */}
      <div className="mb-6">
        <input
          type="file"
          accept=".csv"
          onChange={e => e.target.files && handleCSV(e.target.files[0])}
        />
      </div>

      {/* FILTERS */}
      <div className="mb-3">
        <button onClick={() => filterRepairs('thisMonth')} className="btn mr-2">This Month</button>
        <button onClick={() => filterRepairs('lastMonth')} className="btn mr-2">Last Month</button>
        <button onClick={() => filterRepairs('thisYear')} className="btn">This Year</button>
      </div>

      {/* TABLE */}
      <table className="w-full border">
        <thead className="bg-gray-100">
          <tr>
            <th className="border p-1">Item</th>
            <th className="border p-1">Listing</th>
            <th className="border p-1">Price</th>
            <th className="border p-1">Date</th>
            <th className="border p-1">Source</th>
          </tr>
        </thead>
        <tbody>
          {repairs.map(r => (
            <tr key={r.id}>
              <td className="border p-1">{r.item_name}</td>
              <td className="border p-1">{r.listing_id}</td>
              <td className="border p-1">£{r.price}</td>
              <td className="border p-1">{r.date_sold}</td>
              <td className="border p-1">{r.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
