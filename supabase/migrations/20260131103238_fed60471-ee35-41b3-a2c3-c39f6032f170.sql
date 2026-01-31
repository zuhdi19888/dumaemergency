-- Create app_role enum for type safety
CREATE TYPE public.app_role AS ENUM ('admin', 'doctor', 'pharmacist', 'receptionist');

-- Create profiles table linked to auth.users
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role app_role NOT NULL DEFAULT 'receptionist',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create user_roles table for RBAC (security best practice)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Create patients table
CREATE TABLE public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth DATE,
  gender TEXT CHECK (gender IN ('male', 'female', 'other')),
  phone TEXT,
  email TEXT,
  address TEXT,
  blood_type TEXT,
  allergies TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create medicines table
CREATE TABLE public.medicines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  generic_name TEXT,
  description TEXT,
  category TEXT,
  unit TEXT NOT NULL DEFAULT 'tablet',
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 10,
  unit_price DECIMAL(10,2) DEFAULT 0,
  expiry_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create visits table
CREATE TABLE public.visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  visit_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  chief_complaint TEXT,
  diagnosis TEXT,
  notes TEXT,
  vitals JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  doctor_id UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create prescriptions table
CREATE TABLE public.prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  prescription_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dispensed', 'cancelled')),
  doctor_id UUID REFERENCES auth.users(id),
  dispensed_by UUID REFERENCES auth.users(id),
  dispensed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create prescription_items table
CREATE TABLE public.prescription_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id UUID NOT NULL REFERENCES public.prescriptions(id) ON DELETE CASCADE,
  medicine_id UUID NOT NULL REFERENCES public.medicines(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  dosage TEXT,
  frequency TEXT,
  duration TEXT,
  instructions TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create inventory_transactions table for stock tracking
CREATE TABLE public.inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medicine_id UUID NOT NULL REFERENCES public.medicines(id) ON DELETE CASCADE,
  quantity_change INTEGER NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('stock_in', 'dispensed', 'adjustment', 'expired', 'returned')),
  reference_id UUID,
  notes TEXT,
  performed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescription_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
$$;

-- Helper function to check if user is doctor
CREATE OR REPLACE FUNCTION public.is_doctor()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'doctor')
$$;

-- Helper function to check if user is pharmacist
CREATE OR REPLACE FUNCTION public.is_pharmacist()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'pharmacist')
$$;

-- Helper function to check if user is receptionist
CREATE OR REPLACE FUNCTION public.is_receptionist()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'receptionist')
$$;

-- Helper to get user role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admin can insert profiles" ON public.profiles
  FOR INSERT WITH CHECK (public.is_admin() OR auth.uid() = id);

-- RLS Policies for user_roles
CREATE POLICY "Users can view own role" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Only admin can manage roles" ON public.user_roles
  FOR ALL USING (public.is_admin());

-- RLS Policies for patients
CREATE POLICY "Staff can view patients" ON public.patients
  FOR SELECT USING (
    public.is_admin() OR public.is_doctor() OR public.is_receptionist() OR public.is_pharmacist()
  );

CREATE POLICY "Admin, Doctor, Receptionist can create patients" ON public.patients
  FOR INSERT WITH CHECK (
    public.is_admin() OR public.is_doctor() OR public.is_receptionist()
  );

CREATE POLICY "Admin can update patients" ON public.patients
  FOR UPDATE USING (public.is_admin() OR public.is_doctor() OR public.is_receptionist());

CREATE POLICY "Only admin can delete patients" ON public.patients
  FOR DELETE USING (public.is_admin());

-- RLS Policies for medicines
CREATE POLICY "Staff can view medicines" ON public.medicines
  FOR SELECT USING (
    public.is_admin() OR public.is_doctor() OR public.is_pharmacist() OR public.is_receptionist()
  );

CREATE POLICY "Admin and Pharmacist can manage medicines" ON public.medicines
  FOR INSERT WITH CHECK (public.is_admin() OR public.is_pharmacist());

CREATE POLICY "Admin and Pharmacist can update medicines" ON public.medicines
  FOR UPDATE USING (public.is_admin() OR public.is_pharmacist());

CREATE POLICY "Admin and Pharmacist can delete medicines" ON public.medicines
  FOR DELETE USING (public.is_admin() OR public.is_pharmacist());

-- RLS Policies for visits
CREATE POLICY "Staff can view visits" ON public.visits
  FOR SELECT USING (
    public.is_admin() OR public.is_doctor() OR public.is_receptionist() OR public.is_pharmacist()
  );

CREATE POLICY "Admin, Doctor, Receptionist can create visits" ON public.visits
  FOR INSERT WITH CHECK (
    public.is_admin() OR public.is_doctor() OR public.is_receptionist()
  );

CREATE POLICY "Admin and Doctor can update visits" ON public.visits
  FOR UPDATE USING (public.is_admin() OR public.is_doctor());

CREATE POLICY "Only admin can delete visits" ON public.visits
  FOR DELETE USING (public.is_admin());

-- RLS Policies for prescriptions
CREATE POLICY "Staff can view prescriptions" ON public.prescriptions
  FOR SELECT USING (
    public.is_admin() OR public.is_doctor() OR public.is_pharmacist() OR public.is_receptionist()
  );

CREATE POLICY "Admin and Doctor can create prescriptions" ON public.prescriptions
  FOR INSERT WITH CHECK (public.is_admin() OR public.is_doctor());

CREATE POLICY "Admin, Doctor, Pharmacist can update prescriptions" ON public.prescriptions
  FOR UPDATE USING (public.is_admin() OR public.is_doctor() OR public.is_pharmacist());

CREATE POLICY "Only admin can delete prescriptions" ON public.prescriptions
  FOR DELETE USING (public.is_admin());

-- RLS Policies for prescription_items
CREATE POLICY "Staff can view prescription items" ON public.prescription_items
  FOR SELECT USING (
    public.is_admin() OR public.is_doctor() OR public.is_pharmacist() OR public.is_receptionist()
  );

CREATE POLICY "Admin and Doctor can create prescription items" ON public.prescription_items
  FOR INSERT WITH CHECK (public.is_admin() OR public.is_doctor());

CREATE POLICY "Only admin can delete prescription items" ON public.prescription_items
  FOR DELETE USING (public.is_admin());

-- RLS Policies for inventory_transactions
CREATE POLICY "Staff can view inventory transactions" ON public.inventory_transactions
  FOR SELECT USING (
    public.is_admin() OR public.is_pharmacist() OR performed_by = auth.uid()
  );

CREATE POLICY "Admin and Pharmacist can create transactions" ON public.inventory_transactions
  FOR INSERT WITH CHECK (public.is_admin() OR public.is_pharmacist());

-- Function to handle profile creation on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;

-- Trigger for auto profile creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to dispense prescription and deduct stock
CREATE OR REPLACE FUNCTION public.dispense_prescription(_prescription_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item RECORD;
  current_stock INTEGER;
BEGIN
  -- Check if user is admin or pharmacist
  IF NOT (public.is_admin() OR public.is_pharmacist()) THEN
    RAISE EXCEPTION 'Unauthorized: Only admin or pharmacist can dispense';
  END IF;

  -- Check if prescription exists and is pending
  IF NOT EXISTS (
    SELECT 1 FROM public.prescriptions 
    WHERE id = _prescription_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Prescription not found or already dispensed';
  END IF;

  -- Loop through prescription items and deduct stock
  FOR item IN 
    SELECT pi.medicine_id, pi.quantity, m.stock_quantity, m.name
    FROM public.prescription_items pi
    JOIN public.medicines m ON m.id = pi.medicine_id
    WHERE pi.prescription_id = _prescription_id
  LOOP
    -- Check if enough stock
    IF item.stock_quantity < item.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for medicine: %', item.name;
    END IF;

    -- Deduct stock
    UPDATE public.medicines
    SET stock_quantity = stock_quantity - item.quantity,
        updated_at = now()
    WHERE id = item.medicine_id;

    -- Log transaction
    INSERT INTO public.inventory_transactions (
      medicine_id, quantity_change, transaction_type, reference_id, performed_by, notes
    ) VALUES (
      item.medicine_id, -item.quantity, 'dispensed', _prescription_id, auth.uid(),
      'Dispensed for prescription ' || _prescription_id::text
    );
  END LOOP;

  -- Update prescription status
  UPDATE public.prescriptions
  SET status = 'dispensed',
      dispensed_by = auth.uid(),
      dispensed_at = now(),
      updated_at = now()
  WHERE id = _prescription_id;

  RETURN TRUE;
END;
$$;

-- Function to add stock
CREATE OR REPLACE FUNCTION public.add_stock(_medicine_id UUID, _quantity INTEGER, _notes TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if user is admin or pharmacist
  IF NOT (public.is_admin() OR public.is_pharmacist()) THEN
    RAISE EXCEPTION 'Unauthorized: Only admin or pharmacist can add stock';
  END IF;

  -- Update stock
  UPDATE public.medicines
  SET stock_quantity = stock_quantity + _quantity,
      updated_at = now()
  WHERE id = _medicine_id;

  -- Log transaction
  INSERT INTO public.inventory_transactions (
    medicine_id, quantity_change, transaction_type, performed_by, notes
  ) VALUES (
    _medicine_id, _quantity, 'stock_in', auth.uid(), _notes
  );

  RETURN TRUE;
END;
$$;

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_medicines_updated_at BEFORE UPDATE ON public.medicines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_visits_updated_at BEFORE UPDATE ON public.visits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_prescriptions_updated_at BEFORE UPDATE ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_patients_name ON public.patients(last_name, first_name);
CREATE INDEX idx_visits_patient ON public.visits(patient_id);
CREATE INDEX idx_visits_date ON public.visits(visit_date DESC);
CREATE INDEX idx_prescriptions_visit ON public.prescriptions(visit_id);
CREATE INDEX idx_prescriptions_status ON public.prescriptions(status);
CREATE INDEX idx_prescription_items_prescription ON public.prescription_items(prescription_id);
CREATE INDEX idx_medicines_name ON public.medicines(name);
CREATE INDEX idx_medicines_low_stock ON public.medicines(stock_quantity) WHERE stock_quantity <= low_stock_threshold;
CREATE INDEX idx_inventory_transactions_medicine ON public.inventory_transactions(medicine_id);
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);