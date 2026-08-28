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

const NATIONAL_HOLIDAYS: string[] = [
  '2025-01-01', '2025-01-29', '2025-03-29', '2025-03-31', '2025-04-18', '2025-05-01', '2025-05-12', '2025-05-29', '2025-06-01', '2025-06-06', '2025-06-27', '2025-08-17', '2025-09-05', '2025-12-25',
  '2026-01-01', '2026-01-16', '2026-02-17', '2026-03-19', '2026-03-20', '2026-03-21', '2026-04-03', '2026-05-01', '2026-05-14', '2026-05-27', '2026-06-01', '2026-06-16', '2026-08-17', '2026-08-25', '2026-12-25'
]

function isWeekendOrHoliday(date: Date): boolean {
  const dayOfWeek = date.getDay()
  if (dayOfWeek === 0 || dayOfWeek === 6) return true
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return NATIONAL_HOLIDAYS.includes(`${yyyy}-${mm}-${dd}`)
}

function getPaydayDate(year: number, month: number): Date {
  const lastDay = new Date(year, month + 1, 0).getDate()
  let payday = new Date(year, month, lastDay - 1)
  while (isWeekendOrHoliday(payday)) {
    payday.setDate(payday.getDate() - 1)
  }
  return payday
}

function isInPaydayCycle(transDate: Date, targetYear: number, targetMonth: number): boolean {
  let prevYear = targetYear
  let prevMonth = targetMonth - 1
  if (prevMonth < 0) {
    prevMonth = 11
    prevYear -= 1
  }

  const cycleStart = getPaydayDate(prevYear, prevMonth)
  cycleStart.setHours(0, 0, 0, 0)

  const nextPayday = getPaydayDate(targetYear, targetMonth)
  nextPayday.setHours(0, 0, 0, 0)

  const trans = new Date(transDate)
  trans.setHours(0, 0, 0, 0)

  return trans >= cycleStart && trans < nextPayday
}

export default function Home() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth())
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear())
  const [usePaydayCycle, setUsePaydayCycle] = useState<boolean>(true)

  // State Modal Batch Input
  const [showBatchModal, setShowBatchModal] = useState(false)
  const [batchText, setBatchText] = useState('')
  const [submittingBatch, setSubmittingBatch] = useState(false)

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

  const handleProcessBatch = async () => {
    if (!batchText.trim()) return
    setSubmittingBatch(true)

    try {
      const res = await fetch('/api/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: batchText })
      })

      const result = await res.json()
      if (res.ok) {
        alert(`Berhasil menambahkan ${result.count} transaksi!`)
        setBatchText('')
        setShowBatchModal(false)
        fetchExpenses()
      } else {
        alert(result.error || 'Gagal memproses batch.')
      }
    } catch (err) {
      alert('Terjadi kesalahan koneksi.')
    } finally {
      setSubmittingBatch(false)
    }
  }

  const currentPayday = getPaydayDate(selectedYear, selectedMonth)
  const formattedPaydayStr = `${currentPayday.getDate()} ${months[currentPayday.getMonth()]}`

  const filteredExpenses = expenses.filter((item) => {
    const date = new Date(item.created_at)
    if (usePaydayCycle) {
      return isInPaydayCycle(date, selectedYear, selectedMonth)
    } else {
      return date.getMonth() === selectedMonth && date.getFullYear() === selectedYear
    }
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
        {/* Header & Filter */}
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
          
          {/* Mode Siklus & Tombol Batch */}
          <div className="flex flex-col gap-2 mt-1">
            <div className="bg-white p-3 rounded-xl border border-gray-100 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-gray-800">
                  Mode Siklus Gajian Otomatis
                </span>
                <span className="text-[11px] text-gray-500">
                  Gajian periode ini: <strong className="text-emerald-700">{formattedPaydayStr}</strong>
                </span>
              </div>
              <input
                type="checkbox"
                checked={usePaydayCycle}
                onChange={(e) => setUsePaydayCycle(e.target.checked)}
                className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
              />
            </div>

            <button
              onClick={() => setShowBatchModal(true)}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
            >
              <span>⚡</span> Input Banyak Transaksi (Batch)
            </button>
          </div>
        </div>

        {/* Ringkasan Saldo */}
        <div className="bg-emerald-800 text-white rounded-2xl p-6 shadow-lg space-y-4">
          <div>
            <span className="text-xs text-emerald-200 font-medium">
              Sisa Saldo Periode {months[selectedMonth]}
            </span>
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

      {/* MODAL BATCH INPUT */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-bold text-gray-800 text-lg">Input Banyak Transaksi sekaligus</h3>
              <button
                onClick={() => setShowBatchModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-500">
              Tempelkan teks berisi daftar transaksi. Sistem hanya akan mengekstrak <strong>deskripsi</strong> &amp; <strong>nominal</strong> (kata/emoji lainnya diabaikan).
            </p>

            <textarea
              rows={8}
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
              placeholder="Contoh:&#10;1. Bayar tour Lainnya — Rp 1.400.000&#10;2. ✨ Kasih mamah + susu Rp 2.300.000&#10;3. 🛍️ Bayar baju elok — Rp 200.000"
              className="w-full p-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowBatchModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl font-medium"
              >
                Batal
              </button>
              <button
                onClick={handleProcessBatch}
                disabled={submittingBatch}
                className="px-5 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium disabled:opacity-50"
              >
                {submittingBatch ? 'Memproses...' : 'Proses & Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}