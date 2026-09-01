'use client'

import { useState } from 'react'

interface Transaction {
  id: string
  description: string
  amount: number
  type: 'pemasukan' | 'pengeluaran'
  category: string
  created_at: string
}

// 1. Fungsi Ikon Emoji Lucu & Badge Warna Pastel
const getCategoryDetails = (category: string, description: string) => {
  const desc = description.toLowerCase()
  const cat = category.toLowerCase()

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

export default function FinancialDashboard({ transactions = [], onDelete }: { transactions: Transaction[], onDelete: (id: string) => void }) {
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua')

  // Hitung total saldo
  const totalBalance = transactions.reduce((acc, curr) => {
    return curr.type === 'pemasukan' ? acc + curr.amount : acc - curr.amount
  }, 0)

  // Filter daftar berdasarkan Pill Button
  const categories = ['Semua', 'Pendidikan', 'Tagihan', 'Belanja', 'Kebutuhan', 'Umum']
  
  const filteredTransactions = transactions.filter((t) => {
    if (selectedCategory === 'Semua') return true
    const details = getCategoryDetails(t.category, t.description)
    return details.label.toLowerCase() === selectedCategory.toLowerCase()
  })

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-4">
      
      {/* 5. MASKOT CELENGAN LUCU & KARTU UTAMA MELAYANG */}
      <div className="bg-emerald-950 text-white p-6 rounded-3xl shadow-sm border border-emerald-900 relative overflow-hidden">
        <div className="flex justify-between items-start relative z-10">
          <div>
            <span className="text-emerald-300 text-xs font-medium tracking-wide uppercase">Sisa Saldo Periode Ini</span>
            <h1 className="text-3xl font-extrabold mt-1 tracking-tight">
              Rp {new Intl.NumberFormat('id-ID').format(totalBalance)}
            </h1>
          </div>
          {/* Reaksi Maskot Lucu */}
          <div className="bg-emerald-900/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-emerald-700/50 flex items-center gap-2 text-xs">
            <span className="text-base">{totalBalance < 0 ? '🐷💦' : '🐷🕶️'}</span>
            <span className="text-emerald-200 font-medium">
              {totalBalance < 0 ? 'Dompet boncos!' : 'Aman terkendali!'}
            </span>
          </div>
        </div>
      </div>

      {/* 4. TAB FILTER KATEGORI (PILL BUTTONS) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            Riwayat Transaksi
            <span className="bg-slate-100 text-slate-600 text-xs px-2.5 py-0.5 rounded-full font-semibold">
              {filteredTransactions.length}
            </span>
          </h2>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {categories.map((cat) => {
            const isActive = selectedCategory === cat
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-emerald-700 text-white shadow-sm'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {cat}
              </button>
            )
          })}
        </div>
      </div>

      {/* 2 & 3. DOKUMEN TABEL FLAT DENGAN BORDER RADIUS & SHADOW TIPIS */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        {filteredTransactions.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            🎈 Belum ada transaksi di kategori ini.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredTransactions.map((item) => {
              const details = getCategoryDetails(item.category, item.description)
              const formattedDate = new Date(item.created_at).toLocaleDateString('id-ID', {
                day: '2-digit',
                month: 'short',
              })

              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3.5 hover:bg-slate-50/80 transition-colors group"
                >
                  {/* Sisi Kiri: Emoji + Nama + Tag */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-slate-100/80 flex items-center justify-center text-xl shrink-0">
                      {details.emoji}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">
                        {item.description}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium border ${details.bg}`}>
                          {details.label}
                        </span>
                        <span className="text-[11px] text-slate-400 font-normal">
                          {formattedDate}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Sisi Kanan: Nominal + Tombol Hapus */}
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-sm font-bold ${item.type === 'pemasukan' ? 'text-emerald-600' : 'text-slate-900'}`}>
                      {item.type === 'pemasukan' ? '+ ' : ''}Rp {new Intl.NumberFormat('id-ID').format(item.amount)}
                    </span>
                    <button
                      onClick={() => onDelete(item.id)}
                      className="text-slate-300 hover:text-red-500 transition-colors text-base p-1"
                      title="Hapus"
                    >
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
  )
}