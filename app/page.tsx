'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

interface Expense {
  id: string
  created_at: string
  amount: number
  category: string
  description: string
  type: 'pemasukan' | 'pengeluaran'
}

export default function Home() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth())
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear())
  const [usePaydayCycle, setUsePaydayCycle] = useState<boolean>(true)

  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ]

  const fetchExpenses = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error && data) {
      setExpenses(data as Expense[])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchExpenses()
  }, [])

  const handleDelete = async (id: string) => {
    if (confirm('Yakin ingin menghapus transaksi ini?')) {
      const { error } = await supabase.from('expenses').delete().eq('id', id)
      if (!error) {
        setExpenses((prev) => prev.filter((item) => item.id !== id))
      } else {
        alert('Gagal menghapus transaksi.')
      }
    }
  }

  // Filter transaksi berdasarkan Bulan Kalender vs Siklus Gaji (25 ke atas masuk bulan depan)
  const filteredExpenses = expenses.filter((item) => {
    const date = new Date(item.created_at)
    const day = date.getDate()
    let m = date.getMonth()
    let y = date.getFullYear()

    if (usePaydayCycle) {
      if (day >= 25) {
        m = (m + 1) % 12
        if (m === 0) y += 1
      }
    }

    return m === selectedMonth && y === selectedYear
  })

  const totalPemasukan = filteredExpenses
    .filter((e) => e.type === 'pemasukan')
    .reduce((acc, curr) => acc + curr.amount, 0)

  const totalPengeluaran = filteredExpenses
    .filter((e) => e.type !== 'pemasukan')
    .reduce((acc, curr) => acc + curr.amount, 0)

  const sisaSaldo = totalPemasukan - totalPengeluaran

  return (
    <main className="min-h-screen bg-[#F4F7F4] p-4 md:p-8 font-sans">
      <div className="max-w-xl mx-auto space-y-6">
        {/* Header & Filter Bulan */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold tracking-wider text-emerald-700 uppercase">
            Pencatat Keuangan
          </span>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Ringkasan Keuangan</h1>
            <div className="flex gap-2">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm focus:outline-none"
              >
                {months.map((m, idx) => (
                  <option key={idx} value={idx}>{m}</option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm focus:outline-none"
              >
                <option value={2025}>2025</option>
                <option value={2026}>2026</option>
                <option value={2027}>2027</option>
              </select>
            </div>
          </div>
          
          {/* Toggle Siklus Gaji */}
          <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-gray-100 mt-2">
            <span className="text-xs text-gray-600 font-medium">
              Siklus Gaji Akhir Bulan <span className="text-gray-400">(Tgl 25 - 24)</span>
            </span>
            <input
              type="checkbox"
              checked={usePaydayCycle}
              onChange={(e) => setUsePaydayCycle(e.target.checked)}
              className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
            />
          </div>
        </div>

        {/* Card Utama Ringkasan */}
        <div className="bg-emerald-800 text-white rounded-2xl p-6 shadow-lg space-y-4">
          <div>
            <span className="text-xs text-emerald-200 font-medium">Sisa Saldo Periode Ini</span>
            <div className="text-3xl font-bold mt-1">
              Rp {sisaSaldo.toLocaleString('id-ID')}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 border-t border-emerald-700/60 pt-4">
            <div>
              <span className="text-xs text-emerald-200">Total Pemasukan</span>
              <div className="text-lg font-semibold text-emerald-300">
                + Rp {totalPemasukan.toLocaleString('id-ID')}
              </div>
            </div>
            <div>
              <span className="text-xs text-emerald-200">Total Pengeluaran</span>
              <div className="text-lg font-semibold text-emerald-100">
                - Rp {totalPengeluaran.toLocaleString('id-ID')}
              </div>
            </div>
          </div>
        </div>

        {/* Daftar Transaksi */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
              Riwayat Transaksi ({filteredExpenses.length})
            </h2>
            <button
              onClick={fetchExpenses}
              className="text-xs text-emerald-700 hover:underline"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="bg-white p-6 rounded-2xl text-center text-sm text-gray-400">
              Memuat data...
            </div>
          ) : filteredExpenses.length === 0 ? (
            <div className="bg-white p-6 rounded-2xl text-center text-sm text-gray-400 border border-dashed border-gray-200">
              Belum ada transaksi di periode {months[selectedMonth]} {selectedYear}.
            </div>
          ) : (
            filteredExpenses.map((item) => {
              const isIncome = item.type === 'pemasukan'
              const formattedDate = new Date(item.created_at).toLocaleDateString('id-ID', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
              })

              return (
                <div
                  key={item.id}
                  className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow"
                >
                  <div className="space-y-1">
                    <div className="font-semibold text-gray-800 text-sm">
                      {item.description}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                        {item.category || 'Umum'}
                      </span>
                      <span className="text-xs text-gray-400">{formattedDate}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`font-bold text-sm ${
                        isIncome ? 'text-emerald-600' : 'text-gray-900'
                      }`}
                    >
                      {isIncome ? '+' : ''} Rp {item.amount.toLocaleString('id-ID')}
                    </span>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-gray-300 hover:text-red-500 transition-colors p-1"
                      title="Hapus Transaksi"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </main>
  )
}