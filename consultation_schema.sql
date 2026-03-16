-- Consultation System Overhaul Schema
-- Run this in your Supabase Dashboard SQL Editor

CREATE TABLE IF NOT EXISTS doctors (
  id uuid primary key references auth.users(id),
  name text not null,
  specialization text,
  experience_years integer,
  languages text[],
  avatar_url text,
  rating decimal(3,2) default 0,
  total_reviews integer default 0,
  consultation_fee decimal(10,2) default 0,
  is_available_now boolean default false,
  online_minutes_today decimal default 0,
  last_status_change timestamptz default now(),
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS doctor_availability (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid references doctors(id) on delete cascade,
  day_of_week integer, -- 0=Sunday to 6=Saturday
  start_time time not null,
  end_time time not null,
  max_daily_hours integer default 2,
  is_active boolean default true,
  created_at timestamptz default now(),
  CONSTRAINT max_2hrs CHECK (EXTRACT(EPOCH FROM (end_time - start_time))/3600 <= 2)
);

CREATE TABLE IF NOT EXISTS consultation_slots (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid references doctors(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  duration_minutes integer default 30,
  is_booked boolean default false,
  is_blocked boolean default false,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS consultations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references auth.users(id),
  doctor_id uuid references doctors(id),
  slot_id uuid references consultation_slots(id),
  type text check (type in ('scheduled', 'emergency', 'chat', 'audio', 'video')),
  status text check (status in ('pending', 'confirmed', 'active', 'completed', 'cancelled')) default 'pending',
  room_id text unique,
  started_at timestamptz,
  ended_at timestamptz,
  duration_minutes integer,
  notes text,
  prescription text,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS consultation_messages (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid references consultations(id) on delete cascade,
  sender_id uuid references auth.users(id),
  message text,
  message_type text default 'text',
  created_at timestamptz default now()
);

-- Enable RLS
ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultation_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultation_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Public read doctors" ON doctors FOR SELECT USING (true);
CREATE POLICY "Public read slots" ON consultation_slots FOR SELECT USING (true);
CREATE POLICY "Public read availability" ON doctor_availability FOR SELECT USING (true);
CREATE POLICY "Users read own consultations" ON consultations FOR SELECT USING (auth.uid() = patient_id OR auth.uid() = doctor_id);
CREATE POLICY "Users insert consultations" ON consultations FOR INSERT WITH CHECK (auth.uid() = patient_id);
CREATE POLICY "Users update own consultations" ON consultations FOR UPDATE USING (auth.uid() = patient_id OR auth.uid() = doctor_id);
CREATE POLICY "Users read consultation messages" ON consultation_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM consultations c WHERE c.id = consultation_id AND (c.patient_id = auth.uid() OR c.doctor_id = auth.uid()))
);
CREATE POLICY "Users send messages" ON consultation_messages FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- Enable Realtime on all consultation tables
ALTER PUBLICATION supabase_realtime ADD TABLE consultations;
ALTER PUBLICATION supabase_realtime ADD TABLE consultation_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE consultation_slots;
ALTER PUBLICATION supabase_realtime ADD TABLE doctors;
