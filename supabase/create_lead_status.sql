-- =========================================================================
-- CREATE SEPARATE TABLE: lead_status
-- Keeps 'book_vehicle' completely untouched and undisturbed.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.lead_status (
    user_id TEXT PRIMARY KEY,
    phone TEXT,
    name TEXT,
    status TEXT DEFAULT 'new',
    remarks TEXT DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.lead_status ENABLE ROW LEVEL SECURITY;

-- Allow anon read & write policy for the dashboard
CREATE POLICY "Allow anon access to lead_status"
ON public.lead_status
FOR ALL
USING (true)
WITH CHECK (true);
