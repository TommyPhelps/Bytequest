import type { Rng } from "../rng.ts";
import type { GenOutput, Tier } from "../types.ts";
import { atLeast } from "./util.ts";

// A small retro-computer shop. The generator builds the data in memory, writes
// it as a SQL script, and computes the answers itself, so the answer key is
// exact for this seed.

const FIRST = ["Ada", "Alan", "Grace", "Linus", "Margaret", "Dennis", "Ken", "Barbara", "Steve", "Hedy", "Claude", "Radia", "Frances", "John", "Sophie", "Gordon", "Lynn", "Bjarne", "Guido", "Annie"];
const CITIES = ["Tulsa", "Muskogee", "Broken Arrow", "Norman", "Stillwater", "Edmond", "Bartlesville"];
const PRODUCTS: [string, string, number][] = [
  ["Mechanical Keyboard", "Peripherals", 8900], ["CRT Monitor 17in", "Displays", 6500], ["Ball Mouse", "Peripherals", 1200],
  ["Sound Blaster 16", "Cards", 4500], ["Voodoo2 12MB", "Cards", 9900], ["56k Modem", "Networking", 2500],
  ["10BASE-T Hub", "Networking", 3000], ["Zip Drive 100", "Storage", 5500], ["3.5in Floppies x10", "Storage", 900],
  ["IDE Hard Drive 8GB", "Storage", 7000], ["PS/2 Adapter", "Peripherals", 400], ["Joystick", "Peripherals", 2200],
  ["Pentium II 300", "CPUs", 15000], ["K6-2 350", "CPUs", 11000], ["SDRAM 64MB", "Memory", 4000], ["EDO RAM 32MB", "Memory", 2600],
  ["Cat5 Cable 3m", "Networking", 300], ["ATX Case", "Cases", 4800], ["Serial Null Modem", "Networking", 700], ["CD-RW Drive", "Storage", 6200],
];

interface Order { id: number; customer: number; date: string; items: { product: number; qty: number }[] }

const sq = (s: string) => `'${s.replace(/'/g, "''")}'`;

export function genShop(rng: Rng, tier: Tier): GenOutput {
  const nCust = atLeast(tier, "operator") ? 20 : 12;
  const nOrders = atLeast(tier, "operator") ? 120 : 40;
  const customers = Array.from({ length: nCust }, (_, i) => ({ id: i + 1, name: `${FIRST[i % FIRST.length]} ${String.fromCharCode(65 + ((i * 7) % 26))}.`, city: rng.pick(CITIES) }));
  const products = PRODUCTS.map(([name, category, price], i) => ({ id: i + 1, name, category, price: price + rng.int(-3, 3) * 100 }));
  // Leave a few customers with no orders so the LEFT JOIN question has an answer.
  const active = customers.slice(0, nCust - rng.int(2, 3));
  const orders: Order[] = [];
  for (let i = 0; i < nOrders; i++) {
    const month = rng.int(1, 12);
    const day = rng.int(1, 28);
    const items = rng.sample(products, rng.int(1, 4)).map((p) => ({ product: p.id, qty: rng.int(1, 3) }));
    orders.push({ id: i + 1, customer: rng.pick(active).id, date: `2025-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, items });
  }

  const lines: string[] = [
    "-- BYTEQUEST retro shop dataset. Load with:  sqlite3 shop.db < shop.sql",
    "PRAGMA foreign_keys = ON;",
    "CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, city TEXT NOT NULL);",
    "CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, price_cents INTEGER NOT NULL);",
    "CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id), ordered_on TEXT NOT NULL);",
    "CREATE TABLE order_items (order_id INTEGER NOT NULL REFERENCES orders(id), product_id INTEGER NOT NULL REFERENCES products(id), qty INTEGER NOT NULL, PRIMARY KEY (order_id, product_id));",
    "BEGIN;",
    ...customers.map((c) => `INSERT INTO customers VALUES (${c.id}, ${sq(c.name)}, ${sq(c.city)});`),
    ...products.map((p) => `INSERT INTO products VALUES (${p.id}, ${sq(p.name)}, ${sq(p.category)}, ${p.price});`),
    ...orders.map((o) => `INSERT INTO orders VALUES (${o.id}, ${o.customer}, '${o.date}');`),
    ...orders.flatMap((o) => o.items.map((it) => `INSERT INTO order_items VALUES (${o.id}, ${it.product}, ${it.qty});`)),
    "COMMIT;",
  ];

  // ---- answers ----
  const price = new Map(products.map((p) => [p.id, p.price]));
  const cat = new Map(products.map((p) => [p.id, p.category]));
  const orderTotal = (o: Order) => o.items.reduce((a, it) => a + it.qty * price.get(it.product)!, 0);
  const revenue = orders.reduce((a, o) => a + orderTotal(o), 0);
  const spend = new Map<number, number>();
  for (const o of orders) spend.set(o.customer, (spend.get(o.customer) ?? 0) + orderTotal(o));
  const topSpend = Math.max(...spend.values());
  const topCustomers = customers.filter((c) => spend.get(c.id) === topSpend).map((c) => c.name);
  const units = new Map<string, number>();
  for (const o of orders) for (const it of o.items) units.set(cat.get(it.product)!, (units.get(cat.get(it.product)!) ?? 0) + it.qty);
  const topUnits = Math.max(...units.values());
  const topCats = [...units].filter(([, u]) => u === topUnits).map(([c]) => c).sort();
  const noOrders = customers.filter((c) => !spend.has(c.id)).map((c) => c.name);
  const byMonth = new Map<string, number>();
  for (const o of orders) byMonth.set(o.date.slice(0, 7), (byMonth.get(o.date.slice(0, 7)) ?? 0) + 1);
  const topMonthN = Math.max(...byMonth.values());
  const topMonths = [...byMonth].filter(([, n]) => n === topMonthN).map(([m]) => m).sort();
  const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;

  const answers = [
    { label: "Q1 Total revenue (sum of qty × price)", value: dollars(revenue) },
    { label: "Q2 Biggest spender(s)", value: `${topCustomers.join(", ")} with ${dollars(topSpend)}` },
    { label: "Q3 Category with most units sold", value: `${topCats.join(", ")} (${topUnits} units)` },
    { label: "Q4 Customers with no orders", value: `${noOrders.length}: ${noOrders.join(", ")}` },
  ];
  if (atLeast(tier, "operator")) {
    const avg = revenue / orders.length;
    answers.push(
      { label: "Q5 Busiest month by order count", value: `${topMonths.join(", ")} (${topMonthN} orders)` },
      { label: "Q6 Average order value", value: dollars(Math.round(avg)) + " (rounded to the cent)" },
    );
  }
  return {
    params: { customers: String(nCust), orders: String(nOrders) },
    files: [{ name: "shop.sql", content: lines.join("\n") + "\n", note: "Schema and data. Load with: sqlite3 shop.db < shop.sql" }],
    answers,
  };
}
