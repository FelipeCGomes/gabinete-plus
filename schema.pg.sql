CREATE TABLE IF NOT EXISTS settings(
  id INT PRIMARY KEY DEFAULT 1,
  site_name VARCHAR(120) NOT NULL DEFAULT 'Gabinete+',
  brand_primary VARCHAR(7) DEFAULT '#002B5C',
  brand_secondary VARCHAR(7) DEFAULT '#1E3A8A',
  brand_accent VARCHAR(7) DEFAULT '#B7C9D3',
  heat_low VARCHAR(7) DEFAULT '#dc3545',
  heat_mid VARCHAR(7) DEFAULT '#fd7e14',
  heat_high VARCHAR(7) DEFAULT '#0d6efd',
  login_candidate_photo TEXT,
  login_bg_url TEXT,
  login_bg_type VARCHAR(10) DEFAULT 'image',
  login_bg_blur INT DEFAULT 0,
  login_bg_brightness INT DEFAULT 100,
  about_text TEXT
);

CREATE TABLE IF NOT EXISTS roles(
  key_name VARCHAR(40) PRIMARY KEY,
  name VARCHAR(80),
  immutable INT DEFAULT 0
);
CREATE TABLE IF NOT EXISTS permissions(
  role_key VARCHAR(40),
  resource VARCHAR(80),
  can_view INT DEFAULT 1,
  can_edit INT DEFAULT 0,
  can_delete INT DEFAULT 0,
  PRIMARY KEY(role_key, resource)
);

CREATE TABLE IF NOT EXISTS ra ( id SERIAL PRIMARY KEY, name VARCHAR(80) );

CREATE TABLE IF NOT EXISTS users(
  id SERIAL PRIMARY KEY,
  phone VARCHAR(20) UNIQUE,
  cpf VARCHAR(14),
  password_hash VARCHAR(120) NOT NULL,
  first_name VARCHAR(80), last_name VARCHAR(80),
  address VARCHAR(160), cep VARCHAR(12), city VARCHAR(80),
  ra_id INT, inviter_id INT,
  avatar_url TEXT,
  role_key VARCHAR(40) DEFAULT 'usuario',
  status VARCHAR(20) DEFAULT 'pending',
  goal_enabled INT DEFAULT 0,
  goal_total INT DEFAULT 0,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS presence(
  user_id INT PRIMARY KEY, last_seen BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS posts(
  id SERIAL PRIMARY KEY,
  author_id INT NOT NULL,
  type VARCHAR(20) NOT NULL,
  content TEXT,
  media_url TEXT,
  options_json TEXT,
  event_date VARCHAR(20), event_place VARCHAR(120),
  likes INT DEFAULT 0,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS post_likes(
  post_id INT NOT NULL, user_id INT NOT NULL, PRIMARY KEY(post_id,user_id)
);

CREATE TABLE IF NOT EXISTS comments(
  id SERIAL PRIMARY KEY,
  post_id INT NOT NULL, author_id INT NOT NULL,
  text TEXT, created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS poll_votes(
  post_id INT NOT NULL, option_id VARCHAR(64) NOT NULL, user_id INT NOT NULL,
  PRIMARY KEY(post_id,user_id)
);

CREATE TABLE IF NOT EXISTS banners(
  id SERIAL PRIMARY KEY,
  title VARCHAR(200), image_url TEXT, link_url TEXT,
  active INT DEFAULT 1, created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS invitations(
  id SERIAL PRIMARY KEY,
  code VARCHAR(64) UNIQUE, inviter_id INT NOT NULL,
  full_name VARCHAR(160), phone VARCHAR(20), pending_user_id INT,
  status VARCHAR(20) DEFAULT 'pending', created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs(
  id SERIAL PRIMARY KEY,
  action VARCHAR(80), actor_id INT, target_id INT,
  meta_json TEXT, created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS contact_messages(
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL, phone VARCHAR(40), email VARCHAR(160),
  city VARCHAR(120), uf VARCHAR(2), message TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS push_subs(
  id SERIAL PRIMARY KEY, user_id INT, sub_json TEXT, created_at BIGINT NOT NULL
);

INSERT INTO roles(key_name,name,immutable) VALUES
('admin_master','Admin Master',1),('administrador','Administrador',1),
('moderador','Moderador',0),('usuario','Usuário',1)
ON CONFLICT(key_name) DO NOTHING;
