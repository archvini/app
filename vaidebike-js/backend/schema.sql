CREATE DATABASE IF NOT EXISTS vaidebike CHARACTER SET utf8mb4;
USE vaidebike;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- guardamos só o hash (sha256) do token; o token puro fica no cookie do usuário
CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id INT NOT NULL,
  expires_at DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bikelanes (
  id VARCHAR(40) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  kind ENUM('ciclovia','ciclofaixa') NOT NULL,
  length_km DECIMAL(5,1),
  notes VARCHAR(300),
  coordinates JSON NOT NULL -- [[lat,lng], ...]
);

CREATE TABLE IF NOT EXISTS obstacles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type ENUM('buraco','obra','trecho_inacabado','falta_iluminacao','outros') NOT NULL,
  description VARCHAR(300),
  lat DOUBLE NOT NULL,
  lng DOUBLE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT IGNORE INTO bikelanes (id, name, kind, length_km, notes, coordinates) VALUES
('beira-mar','Ciclovia da Av. Beira-Mar','ciclovia',2.9,'Orla litorânea. Vento forte no fim da tarde.','[[-3.7215,-38.5160],[-3.7235,-38.5120],[-3.7255,-38.5070],[-3.7270,-38.5010],[-3.7285,-38.4950]]'),
('washington-soares','Ciclofaixa da Av. Washington Soares','ciclofaixa',5.6,'Liga Edson Queiroz à Messejana.','[[-3.7565,-38.4900],[-3.7570,-38.5000],[-3.7575,-38.5100],[-3.7580,-38.5200],[-3.7585,-38.5300],[-3.7590,-38.5400]]'),
('aguanambi','Ciclovia da Av. Aguanambi','ciclovia',1.7,'Conexão com o centro e Monte Castelo.','[[-3.7360,-38.5410],[-3.7410,-38.5415],[-3.7460,-38.5420],[-3.7510,-38.5425]]'),
('domingos-olimpio','Ciclovia da Av. Domingos Olímpio','ciclovia',2.3,'Centro, ao lado do metrô.','[[-3.7295,-38.5260],[-3.7300,-38.5320],[-3.7305,-38.5390],[-3.7310,-38.5460]]'),
('santos-dumont','Ciclofaixa da Av. Santos Dumont','ciclofaixa',2.4,'Do centro para Aldeota/Papicu. Atenção às saídas de garagem.','[[-3.7280,-38.5260],[-3.7290,-38.5190],[-3.7300,-38.5120],[-3.7310,-38.5060]]'),
('godofredo-maciel','Ciclovia da Av. Godofredo Maciel','ciclovia',1.8,'Tráfego de caminhões; asfalto irregular.','[[-3.7020,-38.5660],[-3.7050,-38.5600],[-3.7080,-38.5540]]'),
('parque-coco','Ciclovia do Parque do Cocó','ciclovia',1.2,'Trecho de lazer dentro do parque.','[[-3.7490,-38.4860],[-3.7520,-38.4820],[-3.7550,-38.4780]]');
