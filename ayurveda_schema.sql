
CREATE TABLE IF NOT EXISTS public.herbs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    scientific_name TEXT,
    hindi_name TEXT,
    sanskrit_name TEXT,
    description TEXT,
    benefits JSONB,
    uses JSONB,
    dosage TEXT,
    side_effects TEXT,
    category TEXT,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.medicines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    type TEXT,
    description TEXT,
    ingredients JSONB,
    benefits JSONB,
    dosage TEXT,
    manufacturer TEXT,
    category TEXT,
    price NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.encyclopedia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT UNIQUE NOT NULL,
    content TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS herbs_name_idx ON public.herbs (name);
CREATE INDEX IF NOT EXISTS medicines_name_idx ON public.medicines (name);
CREATE INDEX IF NOT EXISTS encyclopedia_title_idx ON public.encyclopedia (title);
