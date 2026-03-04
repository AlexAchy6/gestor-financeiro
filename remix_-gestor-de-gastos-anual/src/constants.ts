import { Expense } from './types';

export const INITIAL_EXPENSES: Expense[] = [
  {
    id: '1',
    description: 'Echo Dot',
    amount: 3032.00,
    date: '2026-01-15',
    costCenter: 'Creare',
    status: 'Evento'
  },
  {
    id: '2',
    description: 'Kindle',
    amount: 6800.00,
    date: '2026-01-28',
    costCenter: 'Creare',
    status: 'Evento'
  },
  {
    id: '3',
    description: 'Coffee Break',
    amount: 430.00,
    date: '2026-02-20',
    costCenter: 'Desenvolv',
    status: 'Coffee Break'
  }
];

export const COST_CENTER_COLORS: Record<string, string> = {
  'Creare': '#3B82F6',
  'Desenvolv': '#10B981',
  'Outros': '#6B7280'
};
