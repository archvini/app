import mysql from "mysql2/promise";
import "dotenv/config";

// "?" nas queries evita SQL injection: nunca monte SQL juntando texto do usuário.
export const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "vaidebike",
  connectionLimit: 10,
});
