export type CostCenter = string;

export interface Expense {
  id: string;
  description: string;
  amount: number;
  date: string;
  costCenter: string;
  status: string;
}

export interface CostCenterSummary {
  name: string;
  value: number;
  color: string;
}
