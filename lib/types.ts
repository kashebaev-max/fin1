export interface Profile {
  id: string;
  email: string;
  full_name: string;
  company_name: string;
  company_bin: string;
  company_address: string;
  director_name: string;
  accountant_name: string;
  bank_name: string;
  bank_iik: string;
  bank_bik: string;
  bank_kbe: string;
  phone: string;
  role: "admin" | "accountant" | "manager" | "employee";
  created_at: string;
}

export interface Counterparty {
  id: string;
  user_id: string;
  name: string;
  bin: string;
  address: string;
  iik: string;
  bank_name: string;
  bank_bik: string;
  phone: string;
  type: "buyer" | "supplier" | "both";
  created_at: string;
}

export interface Product {
  id: string;
  user_id: string;
  name: string;
  unit: string;
  price: number;
  quantity: number;
  min_quantity: number;
  category: "goods" | "materials" | "services";
  created_at: string;
}

export interface Document {
  id: string;
  user_id: string;
  doc_type: string;
  doc_number: string;
  doc_date: string;
  counterparty_id: string | null;
  counterparty_name: string;
  total_sum: number;
  nds_sum: number;
  nds_rate: number;
  total_with_nds: number;
  status: "draft" | "pending" | "sent" | "done" | "cancelled";
  items: DocumentItem[];
  extra_data: Record<string, any>;
  created_at: string;
}

export interface DocumentItem {
  name: string;
  unit: string;
  quantity: number;
  price: number;
  sum: number;
}

export interface Employee {
  id: string;
  user_id: string;
  full_name: string;
  iin: string;
  position: string;
  department: string;
  salary: number;
  hire_date: string;
  status: "active" | "fired";
  created_at: string;
}

export interface JournalEntry {
  id: string;
  user_id: string;
  entry_date: string;
  document_id: string | null;
  doc_ref: string;
  debit_account: string;
  credit_account: string;
  amount: number;
  description: string;
  created_at: string;
}

export interface CashOperation {
  id: string;
  user_id: string;
  op_type: "pko" | "rko";
  op_number: string;
  op_date: string;
  counterparty_name: string;
  amount: number;
  basis: string;
  document_id: string | null;
  created_at: string;
}

export interface BankOperation {
  id: string;
  user_id: string;
  op_type: "in" | "out";
  op_number: string;
  op_date: string;
  counterparty_name: string;
  amount: number;
  purpose: string;
  balance_after: number;
  document_id: string | null;
  created_at: string;
}
