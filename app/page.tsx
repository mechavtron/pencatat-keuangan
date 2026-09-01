'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

interface Transaction {
  id: string
  description: string
  amount: number
  type: 'pemasukan' | 'pengeluaran'
  category: string
  user_name?: string
  created_at: string
}

const getCategoryDetails = (category: string, description: string) => {
  const desc = description.toLowerCase()
  const cat = (category || '').toLowerCase()

  if (desc.includes('spp') || desc.includes('ngaji') || desc.includes('sekolah') || cat === 'pendidikan') {
    return { emoji: '🎒', bg: 'bg-blue-50 text-blue-600 border-blue-100', label: 'Pendidikan' }
  }
  if (desc.includes('shope') || desc.includes('baju') || cat === 'belanja') {
    return { emoji: '🛍️', bg: 'bg-pink-50 text-pink-600 border-pink-100', label: 'Belanja' }
  }
  if (desc.includes('iuran') || desc.includes('prelek') || desc.includes('k3') || desc.includes('jumber') || cat === 'tagihan') {
    return { emoji: '🏠', bg: 'bg-purple-50 text-purple-600 border-purple-100', label: 'Tagihan' }
  }
  if (desc.includes('susu') || desc.includes('mamah') || desc.includes('tour') || desc.includes('pec')) {
    return { emoji: '🥛', bg: 'bg-amber-50 text-amber-600 border-amber-100', label: 'Kebutuhan' }
  }
  if (desc.includes('gaji') || desc.includes('bonus') || desc.includes('pemasukan')) {
    return { emoji: '💰', bg: 'bg-emerald-50 text-emerald-600 border-emerald-100', label: 'Pemasukan' }
  }
  return { emoji: '💸', bg: 'bg-slate-50 text-slate-600 border-slate-100', label: category || 'Umum' }
}

export default function Home() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth())
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear())
  const [isPaydayMode, setIsPaydayMode] = useState(true)
  
  // Filter States
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua')
  const [selectedUserFilter, setSelectedUserFilter] = useState<string>('Semua')

  // Modal Batch Input
  const [isBatchOpen, setIsBatchOpen] = useState(false)
  const [batchText, setBatchText] = useState('')
  const [batchUser, setBatchUser] = useState<'Jae' | 'Miki'>('Jae')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchTransactions = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error && data) {
      setTransactions(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchTransactions()
  }, [])

  // 1. Filter Tanggal & Siklus Gajian (Tanggal 29)
  const filteredByDate = transactions.filter((t) => {
    const tDate = new Date(t.created_at)
    const tMonth = tDate.getMonth()
    const tYear = tDate.getFullYear()

    if (!isPaydayMode) {
      return tMonth === selectedMonth && tYear === selectedYear
    } else {
      const cycleStart = new Date(selectedYear, selectedMonth - 1, 29)
      const cycleEnd = new Date(selectedYear, selectedMonth, 28, 23, 59, 59)
      return tDate >= cycleStart && tDate <= cycleEnd
    }
  })

  // 2. Filter Pengguna & Kategori
  const finalFiltered = filteredByDate.filter((t) => {
    const userMatch = selectedUserFilter === 'Semua' || (t.user_name || 'Jae') === selectedUserFilter
    if (!userMatch) return false

    if (selectedCategory === 'Semua') return true
    const details = getCategoryDetails(t.category, t.description)
    return details.label.toLowerCase() === selectedCategory.toLowerCase()
  })

  // Hitung Total Keuangan
  const totalIncome = filteredByDate
    .filter((t) => t.type === 'pemasukan')
    .reduce((sum, t) => sum + t.amount, 0)

  // Sub-Total Pemasukan Per Orang
  const totalIncomeJae = filteredByDate
    .filter((t) => t.type === 'pemasukan' && (t.user_name || 'Jae') === 'Jae')
    .reduce((sum, t) => sum + t.amount, 0)

  const totalIncomeMiki = filteredByDate
    .filter((t) => t.type === 'pemasukan' && t.user_name === 'Miki')
    .reduce((sum, t) => sum + t.amount, 0)

  const totalExpense = filteredByDate
    .filter((t) => t.type === 'pengeluaran')
    .reduce((sum, t) => sum + t.amount, 0)

  // Sub-Total Pengeluaran Per Orang
  const totalExpenseJae = filteredByDate
    .filter((t) => t.type === 'pengeluaran' && (t.user_name || 'Jae') === 'Jae')
    .reduce((sum, t) => sum + t.amount, 0)

  const totalExpenseMiki = filteredByDate
    .filter((t) => t.type === 'pengeluaran' && t.user_name === 'Miki')
    .reduce((sum, t) => sum + t.amount, 0)

  const netBalance = totalIncome - totalExpense

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus transaksi ini?')) return
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (!error) {
      setTransactions((prev) => prev.filter((t) => t.id !== id))
    }
  }

  const handleBatchSubmit = async () => {
    if (!batchText.trim()) return
    setIsSubmitting(true)
    try {
      const formattedText = `${batchUser.toLowerCase()}: ${batchText}`
      const res = await fetch('/api/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: formattedText }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setBatchText('')
        setIsBatchOpen(false)
        fetchTransactions()
      } else {
        alert(data.error || 'Gagal memproses batch')
      }
    } catch (err) {
      alert('Terjadi kesalahan sistem')
    } finally {
      setIsSubmitting(false)
    }
  }

  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
  const categories = ['Semua', 'Pendidikan', 'Tagihan', 'Belanja', 'Kebutuhan', 'Umum']

  return (
    <main className="min-h-screen bg-slate-50/50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* HEADER: JUDUL + DROPDOWN BULAN & TAHUN */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-xs font-semibold text-emerald-800 tracking-wider uppercase">Pencatat Keuangan Keluarga</span>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Ringkasan Keuangan</h1>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="bg-white border border-slate-200 text-slate-700 font-semibold text-xs rounded-xl px-3 py-2 shadow-sm focus:outline-none"
            >
              {months.map((m, idx) => (
                <option key={m} value={idx}>{m}</option>
              ))}
            </select>

            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-white border border-slate-200 text-slate-700 font-semibold text-xs rounded-xl px-3 py-2 shadow-sm focus:outline-none"
            >
              {[2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {/* TOGGLE SIKLUS GAJIAN */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-3.5 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-800">Mode Siklus Gajian Otomatis</p>
            <p className="text-[11px] text-slate-500">Gajian periode ini: 29 {months[selectedMonth === 0 ? 11 : selectedMonth - 1]}</p>
          </div>
          <input
            type="checkbox"
            checked={isPaydayMode}
            onChange={(e) => setIsPaydayMode(e.target.checked)}
            className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
          />
        </div>

        {/* TOMBOL BATCH INPUT */}
        <button
          onClick={() => setIsBatchOpen(true)}
          className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm py-3 px-4 rounded-2xl shadow-sm transition-all flex items-center justify-center gap-2"
        >
          <span>⚡</span> Input Banyak Transaksi (Batch)
        </button>

        {/* KARTU SALDO UTAMA + MASKOT + RINCIAN PEMASUKAN & PENGELUARAN JAE & MIKI */}
        <div className="bg-emerald-950 text-white p-6 rounded-3xl shadow-md border border-emerald-900 space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-emerald-300 text-xs font-medium uppercase tracking-wide">Sisa Saldo Periode Ini</span>
              <h2 className="text-3xl font-extrabold mt-1 tracking-tight">
                Rp {new Intl.NumberFormat('id-ID').format(netBalance)}
              </h2>
            </div>
            <div className="bg-emerald-900/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-emerald-700/50 flex items-center gap-2 text-xs">
              <span className="text-base">{netBalance < 0 ? '🐷💦' : '🐷🕶️'}</span>
              <span className="text-emerald-200 font-medium">
                {netBalance < 0 ? 'Dompet boncos!' : 'Aman terkendali!'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-emerald-900/80 text-xs">
            {/* Total Pemasukan + Rincian Jae & Miki */}
            <div>
              <span className="text-emerald-400 font-medium">Total Pemasukan</span>
              <p className="text-base font-bold text-emerald-300 mt-0.5">
                + Rp {new Intl.NumberFormat('id-ID').format(totalIncome)}
              </p>

              {/* Sub-Total Pemasukan Jae & Miki */}
              <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-emerald-900/60 text-[11px]">
                <div className="bg-emerald-900/70 px-2 py-1 rounded-lg border border-emerald-800">
                  <span className="text-emerald-300">👨‍🦱 Jae: </span>
                  <span className="font-semibold text-white">
                    Rp {new Intl.NumberFormat('id-ID').format(totalIncomeJae)}
                  </span>
                </div>
                <div className="bg-emerald-900/70 px-2 py-1 rounded-lg border border-emerald-800">
                  <span className="text-purple-300">👩 Miki: </span>
                  <span className="font-semibold text-white">
                    Rp {new Intl.NumberFormat('id-ID').format(totalIncomeMiki)}
                  </span>
                </div>
              </div>
            </div>

            {/* Total Pengeluaran + Rincian Jae & Miki */}
            <div>
              <span className="text-emerald-400 font-medium">Total Pengeluaran</span>
              <p className="text-base font-bold text-red-300 mt-0.5">
                - Rp {new Intl.NumberFormat('id-ID').format(totalExpense)}
              </p>

              {/* Sub-Total Pengeluaran Jae & Miki */}
              <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-emerald-900/60 text-[11px]">
                <div className="bg-emerald-900/70 px-2 py-1 rounded-lg border border-emerald-800">
                  <span className="text-emerald-300">👨‍🦱 Jae: </span>
                  <span className="font-semibold text-white">
                    Rp {new Intl.NumberFormat('id-ID').format(totalExpenseJae)}
                  </span>
                </div>
                <div className="bg-emerald-900/70 px-2 py-1 rounded-lg border border-emerald-800">
                  <span className="text-purple-300">👩 Miki: </span>
                  <span className="font-semibold text-white">
                    Rp {new Intl.NumberFormat('id-ID').format(totalExpenseMiki)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* FILTER USER & KATEGORI PILLS */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              Riwayat Transaksi
              <span className="bg-slate-200 text-slate-700 text-xs px-2 py-0.5 rounded-full font-semibold">
                {finalFiltered.length}
              </span>
            </h3>

            {/* FILTER USER (Semua / Jae / Miki) */}
            <div className="flex bg-slate-200/80 p-0.5 rounded-xl text-xs font-bold">
              {['Semua', 'Jae', 'Miki'].map((usr) => (
                <button
                  key={usr}
                  onClick={() => setSelectedUserFilter(usr)}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    selectedUserFilter === usr ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  {usr === 'Jae' ? '👨‍🦱 Jae' : usr === 'Miki' ? '👩 Miki' : 'Semua'}
                </button>
              ))}
            </div>
          </div>

          {/* PILL KATEGORI */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                  selectedCategory === cat
                    ? 'bg-emerald-800 text-white shadow-sm'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* DOKUMEN TABEL FLAT RIWAYAT TRANSAKSI */}
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-slate-400 text-sm">Memuat transaksi...</div>
          ) : finalFiltered.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              🎈 Belum ada transaksi di filter ini.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {finalFiltered.map((item) => {
                const details = getCategoryDetails(item.category, item.description)
                const isMiki = (item.user_name || 'Jae') === 'Miki'
                const formattedDate = new Date(item.created_at).toLocaleDateString('id-ID', {
                  day: '2-digit',
                  month: 'short',
                })

                return (
                  <div key={item.id} className="flex items-center justify-between p-3.5 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center text-xl shrink-0">
                        {details.emoji}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{item.description}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {/* Badge User (👨‍🦱 Jae / 👩 Miki) */}
                          <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold border ${isMiki ? 'bg-purple-50 text-purple-600 border-purple-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                            {isMiki ? '👩 Miki' : '👨‍🦱 Jae'}
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium border ${details.bg}`}>
                            {details.label}
                          </span>
                          <span className="text-[11px] text-slate-400">{formattedDate}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-sm font-bold ${item.type === 'pemasukan' ? 'text-emerald-600' : 'text-slate-900'}`}>
                        {item.type === 'pemasukan' ? '+ ' : ''}Rp {new Intl.NumberFormat('id-ID').format(item.amount)}
                      </span>
                      <button onClick={() => handleDelete(item.id)} className="text-slate-300 hover:text-red-500 text-base p-1">
                        ✕
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>

      {/* MODAL BATCH INPUT */}
      {isBatchOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-xl">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-900">⚡ Input Banyak Transaksi (Batch)</h3>
              <button onClick={() => setIsBatchOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {/* PILIH PENGINPUT BATCH */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-600">Catat Atas Nama:</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setBatchUser('Jae')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${batchUser === 'Jae' ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-slate-100 text-slate-600 border-slate-200'}`}
                >
                  👨‍🦱 Jae
                </button>
                <button
                  onClick={() => setBatchUser('Miki')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${batchUser === 'Miki' ? 'bg-purple-600 text-white border-purple-600' : 'bg-slate-100 text-slate-600 border-slate-200'}`}
                >
                  👩 Miki
                </button>
              </div>
            </div>

            <textarea
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
              placeholder="Tempelkan daftar transaksi di sini..."
              rows={6}
              className="w-full p-3 border border-slate-200 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setIsBatchOpen(false)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">
                Batal
              </button>
              <button
                onClick={handleBatchSubmit}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold bg-emerald-700 text-white rounded-xl hover:bg-emerald-800 disabled:opacity-50"
              >
                {isSubmitting ? 'Memproses AI...' : 'Proses Batch'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}