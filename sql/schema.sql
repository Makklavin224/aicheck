-- =============================================
-- ВЕКТРА: Схема базы данных
-- Выполните этот SQL в Supabase → SQL Editor
-- =============================================

-- Таблица пользователей
CREATE TABLE users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  login TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'manager' CHECK (role IN ('admin', 'manager', 'head')),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Таблица проверок
CREATE TABLE checks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  user_name TEXT,
  file_name TEXT,
  file_type TEXT,
  extracted JSONB,
  checks JSONB,
  score INTEGER,
  decision TEXT CHECK (decision IN ('genuine', 'suspicious', 'fake')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Индексы
CREATE INDEX idx_checks_user ON checks(user_id);
CREATE INDEX idx_checks_date ON checks(created_at DESC);

-- RLS (Row Level Security) — отключаем для серверного доступа
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE checks ENABLE ROW LEVEL SECURITY;

-- Политика: сервисный ключ имеет полный доступ
CREATE POLICY "Service key full access users" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service key full access checks" ON checks FOR ALL USING (true) WITH CHECK (true);

-- Начальный администратор (пароль: admin123)
-- bcrypt hash для "admin123"
INSERT INTO users (login, password_hash, name, role) VALUES 
  ('admin', '$2a$10$8K1p/a5FAgTLRMYVPxQg8eOxZnGJl.jPqVN5GYaCVJTqn0Kza2D3m', 'Администратор', 'admin');
