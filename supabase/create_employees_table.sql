-- =========================================================================
-- CREATE SEPARATE TABLE: employees
-- Stores team members created by Admin with auto-generated sequential IDs
-- Keeps all main data tables (book_vehicle, etc.) completely untouched.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    department TEXT DEFAULT 'Sales',
    password TEXT,
    role TEXT DEFAULT 'employee',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index on employee_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_employees_employee_id ON public.employees(employee_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- Allow anon dashboard access for read & write
CREATE POLICY "Allow anon access to employees"
ON public.employees
FOR ALL
USING (true)
WITH CHECK (true);

-- Ensure lead_status table has employee assignment fields if not already present
ALTER TABLE public.lead_status 
ADD COLUMN IF NOT EXISTS assigned_to TEXT,
ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS transferred_from TEXT,
ADD COLUMN IF NOT EXISTS transfer_note TEXT;
