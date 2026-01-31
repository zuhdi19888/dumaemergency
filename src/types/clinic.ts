// Clinic Management System Types

export type AppRole = 'admin' | 'doctor' | 'pharmacist' | 'receptionist';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  created_at: string;
  updated_at: string;
}

export interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  gender: 'male' | 'female' | 'other' | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  blood_type: string | null;
  allergies: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Medicine {
  id: string;
  name: string;
  generic_name: string | null;
  description: string | null;
  category: string | null;
  unit: string;
  stock_quantity: number;
  low_stock_threshold: number;
  unit_price: number;
  expiry_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Visit {
  id: string;
  patient_id: string;
  visit_date: string;
  chief_complaint: string | null;
  diagnosis: string | null;
  notes: string | null;
  vitals: {
    blood_pressure?: string;
    temperature?: string;
    pulse?: string;
    weight?: string;
    height?: string;
  };
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  doctor_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  patient?: Patient;
}

export interface Prescription {
  id: string;
  visit_id: string;
  prescription_date: string;
  notes: string | null;
  status: 'pending' | 'dispensed' | 'cancelled';
  doctor_id: string | null;
  dispensed_by: string | null;
  dispensed_at: string | null;
  created_at: string;
  updated_at: string;
  visit?: Visit;
  items?: PrescriptionItem[];
}

export interface PrescriptionItem {
  id: string;
  prescription_id: string;
  medicine_id: string;
  quantity: number;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  created_at: string;
  medicine?: Medicine;
}

export interface InventoryTransaction {
  id: string;
  medicine_id: string;
  quantity_change: number;
  transaction_type: 'stock_in' | 'dispensed' | 'adjustment' | 'expired' | 'returned';
  reference_id: string | null;
  notes: string | null;
  performed_by: string | null;
  created_at: string;
  medicine?: Medicine;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

export interface DashboardStats {
  totalPatients: number;
  todayVisits: number;
  pendingPrescriptions: number;
  lowStockMedicines: number;
}
