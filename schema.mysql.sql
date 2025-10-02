-- settings / branding
CREATE TABLE IF NOT EXISTS settings(
  id INT PRIMARY KEY DEFAULT 1,
  site_name VARCHAR(120) NOT NULL DEFAULT 'Gabinete+',
  brand_primary VARCHAR(7) DEFAULT '#002B5C',
  brand_secondary VARCHAR(7) DEFAULT '#1E3A8A',
  brand_accent VARCHAR(7) DEFAULT '#B7C9D3',
  heat_low VARCHAR(7) DEFAULT '#dc3545',
  heat_mid VARCHAR(7) DEFAULT '#fd7e14',
  heat_high VARCHAR(7) DEFAULT '#0d6efd',
  login_candidate_photo MEDIUMTEXT,
  login_bg_url MEDIUMTEXT,
  login_bg_type VARCHAR(10) DEFAULT 'image',
  login_bg_blur INT DEFAULT 0,
  login_bg_brightness INT DEFAULT 100,
  about_text MEDIUMTEXT
);

-- roles / permissions
CREATE TABLE IF NOT EXISTS roles(
  key_name VARCHAR(40) PRIMARY KEY,
  name VARCHAR(80),
  immutable TINYINT DEFAULT 0
);
CREATE TABLE IF NOT EXISTS permissions(
  role_key VARCHAR(40),
  resource VARCHAR(80),
  can_view TINYINT DEFAULT 1,
  can_edit TINYINT DEFAULT 0,
  can_delete TINYINT DEFAULT 0,
  PRIMARY KEY(role_key, resource)
);

-- users / presence
CREATE TABLE IF NOT EXISTS ra ( id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(80) );

CREATE TABLE IF NOT EXISTS users(
  id INT AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(20) UNIQUE,
  cpf VARCHAR(14),
  password_hash VARCHAR(120) NOT NULL,
  first_name VARCHAR(80), last_name VARCHAR(80),
  address VARCHAR(160), cep VARCHAR(12), city VARCHAR(80),
  ra_id INT, inviter_id INT,
  avatar_url MEDIUMTEXT,
  role_key VARCHAR(40) DEFAULT 'usuario',
  status VARCHAR(20) DEFAULT 'pending',
  goal_enabled TINYINT DEFAULT 0,
  goal_total INT DEFAULT 0,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS presence(
  user_id INT PRIMARY KEY,
  last_seen BIGINT NOT NULL
);

-- posts / comments / likes / polls
CREATE TABLE IF NOT EXISTS posts(
  id INT AUTO_INCREMENT PRIMARY KEY,
  author_id INT NOT NULL,
  type VARCHAR(20) NOT NULL, -- text|photo|video|poll|event
  content MEDIUMTEXT,
  media_url MEDIUMTEXT,
  options_json MEDIUMTEXT,
  event_date VARCHAR(20), event_place VARCHAR(120),
  likes INT DEFAULT 0,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS post_likes(
  post_id INT NOT NULL,
  user_id INT NOT NULL,
  PRIMARY KEY(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS comments(
  id INT AUTO_INCREMENT PRIMARY KEY,
  post_id INT NOT NULL,
  author_id INT NOT NULL,
  text MEDIUMTEXT,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS poll_votes(
  post_id INT NOT NULL,
  option_id VARCHAR(64) NOT NULL,
  user_id INT NOT NULL,
  PRIMARY KEY(post_id, user_id)
);

-- banners/cards da home
CREATE TABLE IF NOT EXISTS banners(
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200), image_url MEDIUMTEXT, link_url MEDIUMTEXT,
  active TINYINT DEFAULT 1, created_at BIGINT NOT NULL
);

-- invitations / audit / contact / push
CREATE TABLE IF NOT EXISTS invitations(
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(64) UNIQUE,
  inviter_id INT NOT NULL,
  full_name VARCHAR(160),
  phone VARCHAR(20),
  pending_user_id INT,
  status VARCHAR(20) DEFAULT 'pending',
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs(
  id INT AUTO_INCREMENT PRIMARY KEY,
  action VARCHAR(80), actor_id INT, target_id INT,
  meta_json MEDIUMTEXT, created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS contact_messages(
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL, phone VARCHAR(40), email VARCHAR(160),
  city VARCHAR(120), uf VARCHAR(2), message MEDIUMTEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS push_subs(
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT, sub_json MEDIUMTEXT, created_at BIGINT NOT NULL
);

-- seeds mínimos
INSERT IGNORE INTO roles(key_name,name,immutable) VALUES
('admin_master','Admin Master',1),('administrador','Administrador',1),
('moderador','Moderador',0),('usuario','Usuário',1);
