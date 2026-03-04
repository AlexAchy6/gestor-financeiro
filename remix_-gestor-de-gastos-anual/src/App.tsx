import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Plus, 
  TrendingDown, 
  PieChart as PieChartIcon, 
  List, 
  DollarSign, 
  Calendar,
  Building2,
  Trash2,
  RefreshCw,
  CheckCircle2,
  Filter,
  FileUp,
  AlertCircle,
  ArrowUpDown
} from 'lucide-react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid,
  Legend
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { format, parseISO, getYear } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import { Expense, CostCenter, CostCenterSummary } from './types';
import { INITIAL_EXPENSES, COST_CENTER_COLORS } from './constants';
import { cn } from './lib/utils';

export default function App() {
  const [expenses, setExpenses] = useState<Expense[]>(() => {
    const saved = localStorage.getItem('creare_expenses');
    return saved ? JSON.parse(saved) : INITIAL_EXPENSES;
  });
  const [isAdding, setIsAdding] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCostCenter, setSelectedCostCenter] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [chartView, setChartView] = useState<'cr' | 'status'>('status');
  const [sortOrder, setSortOrder] = useState<'default' | 'amount-desc'>('default');
  const [error, setError] = useState<string | null>(null);
  const [importStats, setImportStats] = useState<{total: number, imported: number} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newExpense, setNewExpense] = useState<Partial<Expense>>({
    description: '',
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    costCenter: 'Creare',
    status: ''
  });

  useEffect(() => {
    localStorage.setItem('creare_expenses', JSON.stringify(expenses));
  }, [expenses]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError(null);
    setImportStats(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const dataBuffer = evt.target?.result;
        const wb = XLSX.read(dataBuffer, { type: 'array' });
        
        // Try to find data in all sheets, or just the first one if it has content
        let allNewExpenses: Expense[] = [];
        let totalRowsFound = 0;

        wb.SheetNames.forEach(sheetName => {
          const ws = wb.Sheets[sheetName];
          const sheetData = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as any[][];
          
          if (sheetData.length <= 1) return;

          const headers = (sheetData[0] || []).map(h => String(h).toLowerCase().trim());
          
          // Try to find column indices based on common names
          const dateIdx = headers.findIndex(h => h.includes('data'));
          const itemIdx = headers.findIndex(h => h.includes('item') || h.includes('descri'));
          const amountIdx = headers.findIndex(h => h.includes('custo') || h.includes('valor') || h.includes('total'));
          const crIdx = headers.findIndex(h => h.includes('cr') || h.includes('centro'));
          const statusIdx = headers.findIndex(h => h.includes('status') || h.includes('motivo') || h.includes('categoria'));

          // Fallback to fixed indices if headers not found
          const finalDateIdx = dateIdx !== -1 ? dateIdx : 0;
          const finalItemIdx = itemIdx !== -1 ? itemIdx : 1;
          const finalAmountIdx = amountIdx !== -1 ? amountIdx : 4;
          const finalCrIdx = crIdx !== -1 ? crIdx : 5;
          const finalStatusIdx = statusIdx !== -1 ? statusIdx : 3;

          const sheetExpenses = sheetData.slice(1).map((row: any[], index: number) => {
            if (!row || row.length === 0) return null;
            totalRowsFound++;

            // Handle date
            let dateStr = row[finalDateIdx];
            let finalDate = '';

            if (typeof dateStr === 'string' && dateStr.includes('/')) {
              const parts = dateStr.split(/[\/\-]/);
              if (parts.length === 3) {
                let d = parts[0].trim().padStart(2, '0');
                let m = parts[1].trim().padStart(2, '0');
                let y = parts[2].trim();
                if (y.length === 2) y = `20${y}`;
                finalDate = `${y}-${m}-${d}`;
              }
            } else if (typeof dateStr === 'number') {
              // Excel serial date
              const date = new Date(((dateStr as any) - 25569) * 86400 * 1000);
              if (!isNaN(date.getTime())) {
                finalDate = date.toISOString().split('T')[0];
              }
            } else if (dateStr && String(dateStr).match(/^\d{4}-\d{2}-\d{2}/)) {
              finalDate = String(dateStr).substring(0, 10);
            }

            // Final validation of the date string
            if (!finalDate || isNaN(new Date(finalDate).getTime())) {
              finalDate = new Date().toISOString().split('T')[0];
            }

            // Handle amount
            let amount = 0;
            const amountValue = row[finalAmountIdx];
            if (typeof amountValue === 'number') {
              amount = amountValue;
            } else if (amountValue) {
              // Robust string to number conversion for Brazilian format
              let cleanStr = String(amountValue)
                .replace(/[R$\s\u00A0]/g, '') // Remove R$, spaces, and non-breaking spaces
                .trim();
              
              if (cleanStr.includes(',') && cleanStr.includes('.')) {
                // Format like 1.234,56 -> 1234.56
                const lastComma = cleanStr.lastIndexOf(',');
                const lastDot = cleanStr.lastIndexOf('.');
                if (lastComma > lastDot) {
                  cleanStr = cleanStr.replace(/\./g, '').replace(',', '.');
                } else {
                  cleanStr = cleanStr.replace(/,/g, '');
                }
              } else if (cleanStr.includes(',')) {
                // Format like 1234,56 -> 1234.56
                cleanStr = cleanStr.replace(',', '.');
              } else if (cleanStr.includes('.')) {
                // This could be 1.234 (thousands) or 1234.56 (decimal)
                // In Brazilian context, if there's a dot and it's followed by 3 digits at the end, 
                // it's likely a thousands separator.
                const parts = cleanStr.split('.');
                if (parts.length === 2 && parts[1].length === 3) {
                  cleanStr = cleanStr.replace('.', '');
                }
              }
              
              amount = parseFloat(cleanStr);
            }

            if (isNaN(amount)) amount = 0;

            const rawDescription = row[finalItemIdx] || 'Sem descrição';
            const formattedDescription = String(rawDescription)
              .toLowerCase()
              .split(' ')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');

            return {
              id: `upload-${sheetName}-${index}-${Date.now()}`,
              description: formattedDescription,
              amount: amount,
              date: finalDate,
              costCenter: row[finalCrIdx] ? String(row[finalCrIdx]) : 'Outros',
              status: row[finalStatusIdx] ? String(row[finalStatusIdx]) : 'Geral'
            };
          }).filter((e: any) => e !== null && e.description !== 'Sem descrição');

          allNewExpenses = [...allNewExpenses, ...sheetExpenses];
        });

        if (allNewExpenses.length === 0) {
          throw new Error("Nenhum dado válido encontrado na planilha. Verifique se as colunas (Data, Item, Custo Total) existem.");
        }

        setImportStats({ total: totalRowsFound, imported: allNewExpenses.length });
        setExpenses(allNewExpenses);

      } catch (err: any) {
        setError("Erro ao ler arquivo: " + err.message);
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      if (isNaN(date.getTime())) {
        return "Data inválida";
      }
      return format(date, "dd/MM/yyyy");
    } catch (e) {
      return "Data inválida";
    }
  };

  const filteredExpenses = useMemo(() => {
    let result = expenses;
    
    if (selectedCostCenter) {
      result = result.filter(e => e.costCenter === selectedCostCenter);
    }

    if (selectedStatus) {
      result = result.filter(e => e.status === selectedStatus);
    }

    // Apply sorting
    if (sortOrder === 'amount-desc') {
      result = [...result].sort((a, b) => b.amount - a.amount);
    } else {
      // Default: sort by date descending (newest first)
      result = [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }

    return result;
  }, [expenses, selectedCostCenter, selectedStatus, sortOrder]);

  const totalExpenses = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => {
      const val = typeof e.amount === 'number' && !isNaN(e.amount) ? e.amount : 0;
      return sum + val;
    }, 0);
  }, [filteredExpenses]);

  const costCenterData = useMemo((): CostCenterSummary[] => {
    const summary: Record<string, number> = {};
    filteredExpenses.forEach(e => {
      const cc = e.costCenter || 'Outros';
      const val = typeof e.amount === 'number' && !isNaN(e.amount) ? e.amount : 0;
      summary[cc] = (summary[cc] || 0) + val;
    });
    
    // Simple hash function to generate a color from a string
    const stringToColor = (str: string) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
      }
      const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
      return "#" + "00000".substring(0, 6 - c.length) + c;
    };

    return Object.entries(summary).map(([name, value]) => ({
      name,
      value,
      color: COST_CENTER_COLORS[name] || stringToColor(name)
    }));
  }, [filteredExpenses]);

  const statusData = useMemo((): CostCenterSummary[] => {
    const summary: Record<string, number> = {};
    filteredExpenses.forEach(e => {
      const s = e.status || 'Geral';
      const val = typeof e.amount === 'number' && !isNaN(e.amount) ? e.amount : 0;
      summary[s] = (summary[s] || 0) + val;
    });
    
    const stringToColor = (str: string) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
      }
      const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
      return "#" + "00000".substring(0, 6 - c.length) + c;
    };

    return Object.entries(summary).map(([name, value]) => ({
      name,
      value,
      color: stringToColor(name)
    })).sort((a, b) => b.value - a.value);
  }, [filteredExpenses]);

  const allStatuses = useMemo(() => {
    const statuses = new Set<string>();
    expenses.forEach(e => {
      if (e.status) statuses.add(e.status);
    });
    return Array.from(statuses).sort();
  }, [expenses]);

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpense.description || !newExpense.amount || !newExpense.costCenter) return;

    const formattedDescription = String(newExpense.description!)
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    const expense: Expense = {
      id: crypto.randomUUID(),
      description: formattedDescription,
      amount: Number(newExpense.amount),
      date: newExpense.date!,
      costCenter: newExpense.costCenter!,
      status: newExpense.status || 'Geral'
    };

    setExpenses([expense, ...expenses]);
    setIsAdding(false);
    setNewExpense({
      description: '',
      amount: 0,
      date: new Date().toISOString().split('T')[0],
      costCenter: 'Creare',
      category: ''
    });
  };

  const deleteExpense = (id: string) => {
    setExpenses(expenses.filter(e => e.id !== id));
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans selection:bg-indigo-100">
      {/* Hidden File Input */}
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept=".xlsx, .xls, .csv"
        onChange={handleFileUpload}
      />

      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="/Creare.jpg" 
              alt="Creare Logo" 
              className="h-12 w-auto object-contain"
              onError={(e) => {
                // Fallback if the image is not found in the root
                (e.target as HTMLImageElement).src = "https://picsum.photos/seed/creare-logo-fallback/400/400";
              }}
            />
            <h1 className="text-xl font-bold tracking-tight text-gray-900">
              Gestor Financeiro
            </h1>
          </div>
          
          <div className="flex items-center gap-3">
              <button 
                onClick={() => {
                  if (window.confirm('Tem certeza que deseja apagar todos os lançamentos?')) {
                    setExpenses([]);
                  }
                }}
                className="flex items-center gap-2 text-gray-400 hover:text-red-500 px-3 py-2 rounded-lg transition-all hover:bg-red-50"
                title="Limpar todos os dados"
              >
                <Trash2 size={18} />
                <span className="hidden md:inline font-medium text-sm">Limpar</span>
              </button>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg transition-all shadow-md hover:shadow-lg active:scale-95"
              >
                <FileUp size={18} />
                <span className="hidden sm:inline font-medium">Importar Planilha</span>
              </button>
            </div>
            
            <button 
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-all shadow-md hover:shadow-lg active:scale-95"
            >
              <Plus size={18} />
              <span className="hidden sm:inline font-medium">Novo Gasto</span>
            </button>
          </div>
        </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error and Stats Messages */}
        <AnimatePresence>
          {(error || importStats) && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mb-6 overflow-hidden"
            >
              {error && (
                <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl flex items-center gap-3">
                  <AlertCircle size={20} />
                  <p className="text-sm font-medium">{error}</p>
                </div>
              )}
              {importStats && !error && (
                <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 p-4 rounded-xl flex items-center gap-3">
                  <div className="bg-emerald-100 p-1.5 rounded-full">
                    <FileUp size={16} />
                  </div>
                  <p className="text-sm font-medium">
                    Importação concluída! <strong>{importStats.imported}</strong> de {importStats.total} linhas processadas com sucesso.
                  </p>
                  <button 
                    onClick={() => setImportStats(null)}
                    className="ml-auto text-emerald-400 hover:text-emerald-600"
                  >
                    <Plus className="rotate-45" size={20} />
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                <TrendingDown size={24} />
              </div>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Anual</span>
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalExpenses)}
            </div>
            <p className="text-sm text-gray-500 mt-2">Gastos acumulados no período</p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative group"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
                <CheckCircle2 size={24} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</span>
                {selectedStatus && (
                  <button 
                    onClick={() => setSelectedStatus(null)}
                    className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded hover:bg-amber-200 transition-colors"
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>
            <div className="relative">
              <select 
                value={selectedStatus || ''}
                onChange={(e) => setSelectedStatus(e.target.value || null)}
                className="w-full bg-transparent text-2xl font-bold text-gray-900 appearance-none cursor-pointer focus:outline-none"
              >
                <option value="">Todos Status</option>
                {allStatuses.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center text-gray-400">
                <ArrowUpDown size={16} />
              </div>
            </div>
            <p className="text-sm text-gray-500 mt-2">Filtrar por situação</p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                <List size={24} />
              </div>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Lançamentos</span>
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {filteredExpenses.length}
            </div>
            <p className="text-sm text-gray-500 mt-2">Total de registros</p>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Charts Section */}
          <div className="space-y-8">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm"
            >
              <div className="flex items-center gap-2 mb-6">
                <PieChartIcon className="text-indigo-600" size={20} />
                <h2 className="text-lg font-bold text-gray-900">Distribuição por CR</h2>
              </div>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={costCenterData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                      onClick={(data) => {
                        if (data && data.name) {
                          setSelectedCostCenter(selectedCostCenter === data.name ? null : data.name);
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      {costCenterData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.color} 
                          stroke={selectedCostCenter === entry.name ? '#4F46E5' : 'none'}
                          strokeWidth={2}
                          opacity={selectedCostCenter && selectedCostCenter !== entry.name ? 0.5 : 1}
                        />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend verticalAlign="bottom" height={36}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <TrendingDown className="text-indigo-600" size={20} />
                  <h2 className="text-lg font-bold text-gray-900">
                    {chartView === 'cr' ? 'Gastos por CR' : 'Gastos por Status'}
                  </h2>
                </div>
                <div className="flex bg-gray-100 p-1 rounded-lg">
                  <button 
                    onClick={() => setChartView('status')}
                    className={cn(
                      "px-3 py-1 text-xs font-bold rounded-md transition-all",
                      chartView === 'status' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                    )}
                  >
                    Status
                  </button>
                  <button 
                    onClick={() => setChartView('cr')}
                    className={cn(
                      "px-3 py-1 text-xs font-bold rounded-md transition-all",
                      chartView === 'cr' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                    )}
                  >
                    CR
                  </button>
                </div>
              </div>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartView === 'cr' ? costCenterData : statusData} layout="vertical" margin={{ left: 20, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#F3F4F6" />
                    <XAxis type="number" hide />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 12, fontWeight: 500 }}
                    />
                    <Tooltip 
                      cursor={{ fill: '#F9FAFB' }}
                      formatter={(value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Bar 
                      dataKey="value" 
                      radius={[0, 4, 4, 0]}
                      onClick={(data) => {
                        if (data && data.name) {
                          if (chartView === 'cr') {
                            setSelectedCostCenter(selectedCostCenter === data.name ? null : data.name);
                          } else {
                            setSelectedStatus(selectedStatus === data.name ? null : data.name);
                          }
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      {(chartView === 'cr' ? costCenterData : statusData).map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.color}
                          opacity={
                            (chartView === 'cr' && selectedCostCenter && selectedCostCenter !== entry.name) ||
                            (chartView === 'status' && selectedStatus && selectedStatus !== entry.name)
                            ? 0.5 : 1
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          </div>

          {/* List Section */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col"
          >
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-[5]">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <List className="text-indigo-600" size={20} />
                  <h2 className="text-lg font-bold text-gray-900">Últimos Lançamentos</h2>
                </div>
                {selectedCostCenter && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                      Filtrando por: {selectedCostCenter}
                      <button 
                        onClick={() => setSelectedCostCenter(null)}
                        className="hover:text-indigo-800 transition-colors"
                      >
                        <Trash2 size={10} />
                      </button>
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSortOrder(sortOrder === 'default' ? 'amount-desc' : 'default')}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200",
                    sortOrder === 'amount-desc' 
                      ? "bg-indigo-600 text-white shadow-sm" 
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  )}
                  title={sortOrder === 'amount-desc' ? "Ordenado por Valor (Maior para Menor)" : "Ordenar por Valor"}
                >
                  <ArrowUpDown size={14} />
                  {sortOrder === 'amount-desc' ? "Maior Valor" : "Ordenar"}
                </button>
                {isLoading && <RefreshCw size={14} className="animate-spin text-indigo-600" />}
                <span className="text-xs font-medium px-2 py-1 bg-gray-100 text-gray-500 rounded-full">
                  {filteredExpenses.length} itens
                </span>
              </div>
            </div>
            
            <div className="overflow-y-auto max-h-[700px] divide-y divide-gray-50">
              <AnimatePresence initial={false}>
                {filteredExpenses.length === 0 ? (
                  <div className="p-12 text-center">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Calendar className="text-gray-300" size={32} />
                    </div>
                    <p className="text-gray-500 font-medium">Nenhum gasto registrado.</p>
                  </div>
                ) : (
                  filteredExpenses.map((expense) => (
                    <motion.div 
                      key={expense.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="p-4 hover:bg-gray-50 transition-colors group flex items-center justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <div 
                          className="w-2 h-12 rounded-full" 
                          style={{ backgroundColor: COST_CENTER_COLORS[expense.costCenter] || '#CBD5E1' }}
                        />
                        <div>
                          <h3 className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">
                            {expense.description}
                          </h3>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs font-medium text-gray-600 flex items-center gap-1">
                              <Building2 size={12} />
                              {expense.costCenter}
                            </span>
                            <span className="text-xs font-medium text-gray-600 flex items-center gap-1">
                              <Calendar size={12} />
                              {formatDate(expense.date)}
                            </span>
                            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded uppercase tracking-wider">
                              {expense.status}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="font-bold text-gray-900">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(expense.amount)}
                          </div>
                          <div className="text-[10px] uppercase tracking-wider font-bold text-gray-600">
                            {expense.category}
                          </div>
                        </div>
                        <button 
                          onClick={() => deleteExpense(expense.id)}
                          className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Add Expense Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdding(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100">
                <h2 className="text-xl font-bold text-gray-900">Novo Lançamento</h2>
                <p className="text-sm text-gray-500">Registre um novo gasto no sistema.</p>
              </div>
              
              <form onSubmit={handleAddExpense} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Item</label>
                  <input 
                    autoFocus
                    required
                    type="text"
                    placeholder="Ex: Echo dot, Kindle..."
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                    value={newExpense.description}
                    onChange={e => setNewExpense({...newExpense, description: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Custo Total (R$)</label>
                    <input 
                      required
                      type="number"
                      step="0.01"
                      placeholder="0,00"
                      className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                      value={newExpense.amount === 0 ? '' : newExpense.amount}
                      onChange={e => {
                        const val = parseFloat(e.target.value);
                        setNewExpense({...newExpense, amount: isNaN(val) ? 0 : val});
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Data</label>
                    <input 
                      required
                      type="date"
                      className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                      value={newExpense.date}
                      onChange={e => setNewExpense({...newExpense, date: e.target.value})}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">CR</label>
                  <select 
                    required
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all appearance-none"
                    value={newExpense.costCenter}
                    onChange={e => setNewExpense({...newExpense, costCenter: e.target.value as CostCenter})}
                  >
                    {Object.keys(COST_CENTER_COLORS).map(cc => (
                      <option key={cc} value={cc}>{cc}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Status</label>
                  <input 
                    type="text"
                    placeholder="Ex: Evento, Expediente, Entregue..."
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                    value={newExpense.status || ''}
                    onChange={e => setNewExpense({...newExpense, status: e.target.value})}
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 px-4 py-2 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all active:scale-95"
                  >
                    Salvar Gasto
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
