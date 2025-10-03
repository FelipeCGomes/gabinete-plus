-- MySQL schema (idempotente)

CREATE TABLE IF NOT EXISTS settings (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  site_name VARCHAR(120),
  brand_primary VARCHAR(16),
  brand_secondary VARCHAR(16),
  brand_accent VARCHAR(16),
  heat_low VARCHAR(16),
  heat_mid VARCHAR(16),
  heat_high VARCHAR(16),
  login_candidate_photo VARCHAR(255),
  login_bg_url VARCHAR(255),
  login_bg_type VARCHAR(10),
  login_bg_blur INT DEFAULT 0,
  login_bg_brightness INT DEFAULT 100,
  about_text TEXT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ra (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) UNIQUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS roles (
  key_name VARCHAR(50) PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  immutable TINYINT DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS contact_messages (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(120),
  city VARCHAR(80),
  uf VARCHAR(2),
  message TEXT NOT NULL,
  created_at BIGINT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(80),
  last_name VARCHAR(80),
  phone VARCHAR(20) UNIQUE,
  cpf VARCHAR(14),
  password_hash VARCHAR(120),
  address VARCHAR(255),
  cep VARCHAR(9),
  city VARCHAR(80),
  ra_id BIGINT,
  inviter_id BIGINT,
  avatar_url VARCHAR(255),
  role_key VARCHAR(50) DEFAULT 'usuario',
  status VARCHAR(20) DEFAULT 'pending',
  goal_enabled TINYINT DEFAULT 0,
  goal_total INT DEFAULT 0,
  created_at BIGINT,
  CONSTRAINT fk_users_ra FOREIGN KEY (ra_id) REFERENCES ra(id) ON DELETE SET NULL,
  CONSTRAINT fk_users_inviter FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
CREATE INDEX idx_users_inviter ON users(inviter_id);
CREATE INDEX idx_users_ra ON users(ra_id);
CREATE INDEX idx_users_role ON users(role_key);

CREATE TABLE IF NOT EXISTS presence (
  user_id BIGINT PRIMARY KEY,
  last_seen BIGINT,
  CONSTRAINT fk_presence_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS push_subs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT,
  sub_json TEXT NOT NULL,
  created_at BIGINT,
  CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS banners (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(120),
  image_url VARCHAR(255) NOT NULL,
  link_url VARCHAR(255),
  active TINYINT DEFAULT 1,
  created_at BIGINT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS posts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  author_id BIGINT NOT NULL,
  type VARCHAR(20) NOT NULL,
  content TEXT,
  media_url VARCHAR(255),
  options_json TEXT,
  event_date TEXT,
  event_place TEXT,
  likes INT DEFAULT 0,
  created_at BIGINT,
  CONSTRAINT fk_posts_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE INDEX idx_posts_author ON posts(author_id);

CREATE TABLE IF NOT EXISTS post_likes (
  post_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  PRIMARY KEY (post_id, user_id),
  CONSTRAINT fk_likes_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_likes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS comments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  post_id BIGINT NOT NULL,
  author_id BIGINT NOT NULL,
  text TEXT NOT NULL,
  created_at BIGINT,
  CONSTRAINT fk_comments_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE INDEX idx_comments_post ON comments(post_id);

CREATE TABLE IF NOT EXISTS poll_votes (
  post_id BIGINT NOT NULL,
  option_id VARCHAR(64) NOT NULL,
  user_id BIGINT NOT NULL,
  PRIMARY KEY (post_id, user_id),
  CONSTRAINT fk_votes_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_votes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS invitations (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(64) UNIQUE NOT NULL,
  inviter_id BIGINT NOT NULL,
  full_name VARCHAR(160),
  phone VARCHAR(20),
  status VARCHAR(20) DEFAULT 'pending',
  pending_user_id BIGINT,
  created_at BIGINT,
  CONSTRAINT fk_inviter FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE INDEX idx_invitations_inviter ON invitations(inviter_id);

CREATE TABLE IF NOT EXISTS permissions (
  role_key VARCHAR(50) NOT NULL,
  resource VARCHAR(80) NOT NULL,
  can_view TINYINT DEFAULT 0,
  can_edit TINYINT DEFAULT 0,
  can_delete TINYINT DEFAULT 0,
  PRIMARY KEY (role_key, resource)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  action VARCHAR(80) NOT NULL,
  actor_id BIGINT,
  target_id BIGINT,
  meta_json TEXT,
  created_at BIGINT
) ENGINE=InnoDB;

INSERT IGNORE INTO roles(key_name, name, immutable) VALUES ('admin_master','Administrador Master',1);
INSERT IGNORE INTO roles(key_name, name, immutable) VALUES ('administrador','Administrador',1);
INSERT IGNORE INTO roles(key_name, name, immutable) VALUES ('moderador','Moderador',0);
INSERT IGNORE INTO roles(key_name, name, immutable) VALUES ('usuario','Usuário',0);

INSERT INTO settings(id, site_name) VALUES (1, 'Gabinete+')
ON DUPLICATE KEY UPDATE site_name=VALUES(site_name);
