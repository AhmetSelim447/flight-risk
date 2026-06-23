-- ============================================
-- 001: Kullanıcı Profili
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT DEFAULT 'pilot' CHECK (role IN ('pilot', 'dispatcher', 'student')),
  preferred_airports TEXT[] DEFAULT '{}',
  cross_limit_kt SMALLINT DEFAULT 15,
  default_dep TEXT,
  default_arr TEXT,
  notifications_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Yeni kullanıcı kaydolunca profil otomatik oluşsun
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_profile_select" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "own_profile_update" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "own_profile_insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
