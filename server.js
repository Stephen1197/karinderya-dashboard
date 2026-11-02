const express = require("express");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Database (SQLite file is created automatically) ----------
// On a host with a persistent disk, set DB_PATH (e.g. /data/karinderya.db)
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "karinderya.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS dishes (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT    NOT NULL,
    category  TEXT    NOT NULL,
    price     REAL    NOT NULL,
    stock     INTEGER NOT NULL DEFAULT 0
  )
`);

// Add sample dishes only when the table is empty
if (db.prepare("SELECT COUNT(*) AS n FROM dishes").get().n === 0) {
  const insert = db.prepare(
    "INSERT INTO dishes (name, category, price, stock) VALUES (?, ?, ?, ?)"
  );
  [
    ["Chicken Adobo", "Ulam", 85, 20],
    ["Pork Sinigang", "Ulam", 95, 15],
    ["Pancit Canton", "Pansit", 60, 25],
    ["Plain Rice", "Kanin", 15, 100],
    ["Halo-Halo", "Panghimagas", 70, 12],
    ["Sago't Gulaman", "Inumin", 25, 40],
  ].forEach((d) => insert.run(...d));
}

// ---------- Middleware ----------
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- Validation helper ----------
function validate(body) {
  body = body || {};
  const name = String(body.name || "").trim();
  const category = String(body.category || "").trim();
  const rawPrice = String(body.price ?? "").trim();
  const rawStock = String(body.stock ?? "").trim();
  const price = Number(rawPrice);
  const stock = Number(rawStock);

  if (!name) return { error: "Name is required." };
  if (!category) return { error: "Category is required." };
  if (rawPrice === "" || !Number.isFinite(price) || price < 0)
    return { error: "Price must be a number 0 or higher." };
  if (rawStock === "" || !Number.isInteger(stock) || stock < 0)
    return { error: "Stock must be a whole number 0 or higher." };

  return { data: { name, category, price, stock } };
}

// ---------- CRUD API ----------

// READ all
app.get("/api/dishes", (req, res) => {
  const rows = db.prepare("SELECT * FROM dishes ORDER BY id DESC").all();
  res.json(rows);
});

// READ one
app.get("/api/dishes/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM dishes WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Dish not found." });
  res.json(row);
});

// CREATE
app.post("/api/dishes", (req, res) => {
  const { data, error } = validate(req.body);
  if (error) return res.status(400).json({ error });

  const info = db
    .prepare("INSERT INTO dishes (name, category, price, stock) VALUES (?, ?, ?, ?)")
    .run(data.name, data.category, data.price, data.stock);

  res.status(201).json({ id: info.lastInsertRowid, ...data });
});

// UPDATE
app.put("/api/dishes/:id", (req, res) => {
  const { data, error } = validate(req.body);
  if (error) return res.status(400).json({ error });

  const info = db
    .prepare("UPDATE dishes SET name = ?, category = ?, price = ?, stock = ? WHERE id = ?")
    .run(data.name, data.category, data.price, data.stock, req.params.id);

  if (info.changes === 0) return res.status(404).json({ error: "Dish not found." });
  res.json({ id: Number(req.params.id), ...data });
});

// DELETE
app.delete("/api/dishes/:id", (req, res) => {
  const info = db.prepare("DELETE FROM dishes WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Dish not found." });
  res.json({ message: "Dish deleted." });
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`Karinderya Dashboard running at http://localhost:${PORT}`);
});