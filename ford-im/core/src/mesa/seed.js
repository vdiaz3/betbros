// Datos de ejemplo de Vamo Mesa: un comedor corporativo con catálogo, recetas, inventario,
// empleados, menú de la semana y dos semanas de historial (pedidos, tiempos y encuestas).
import { mdb } from './store.js';
import { uid, shortCode } from '../db.js';
import { today } from './service.js';

const ITEMS = [
  // [nombre, categoría, precio, kcal, emoji, descripción, receta {insumo: cantidad por porción}]
  ['Menú del día: pollo en mole', 'menu', 85, 780, '🍗', 'Sopa de fideo, pollo en mole con arroz, frijoles y agua del día.', { pollo: 0.18, arroz: 0.08, frijol: 0.06, tortilla: 4, agua_fresca: 0.35 }],
  ['Menú del día: tinga de res', 'menu', 85, 740, '🌮', 'Crema de calabaza, tinga de res con arroz y ensalada.', { res: 0.16, arroz: 0.08, verdura: 0.1, tortilla: 4, agua_fresca: 0.35 }],
  ['Menú del día: pescado a la veracruzana', 'menu', 85, 650, '🐟', 'Consomé, filete a la veracruzana, arroz y verduras.', { pescado: 0.17, arroz: 0.08, verdura: 0.12, agua_fresca: 0.35 }],
  ['Menú vegetariano: enchiladas verdes', 'menu', 80, 690, '🥬', 'Sopa de verduras, enchiladas verdes de queso, frijoles.', { queso: 0.08, tortilla: 4, verdura: 0.12, frijol: 0.06, agua_fresca: 0.35 }],
  ['Premium: salmón a la parrilla', 'premium', 165, 620, '🍣', 'Salmón con quinoa, espárragos y aderezo de cítricos.', { salmon: 0.18, quinoa: 0.07, verdura: 0.12 }],
  ['Premium: rib eye bowl', 'premium', 175, 880, '🥩', 'Rib eye en tiras, arroz jazmín, aguacate y pico de gallo.', { res: 0.2, arroz: 0.09, aguacate: 0.5, verdura: 0.08 }],
  ['Grab & go: ensalada César', 'grab_go', 75, 420, '🥗', 'Lechuga orejona, pollo, parmesano y crutones.', { lechuga: 0.15, pollo: 0.1, queso: 0.03 }],
  ['Grab & go: wrap de pollo', 'grab_go', 68, 510, '🌯', 'Tortilla de harina, pollo, vegetales y aderezo de yogur.', { pollo: 0.12, verdura: 0.08, tortilla_harina: 1 }],
  ['Grab & go: bowl de fruta', 'grab_go', 42, 180, '🍉', 'Fruta de temporada picada.', { fruta: 0.25 }],
  ['Grab & go: yogur con granola', 'grab_go', 38, 260, '🥣', 'Yogur natural, granola y miel.', { yogur: 0.2, granola: 0.04 }],
  ['Grab & go: agua natural 600 ml', 'grab_go', 18, 0, '💧', 'Botella de agua natural.', { agua_botella: 1 }],
];
const INGREDIENTS = [
  // [id, nombre, unidad, existencia, mínimo, costo unitario]
  ['pollo', 'Pechuga de pollo', 'kg', 42, 15, 118], ['res', 'Carne de res', 'kg', 26, 12, 215], ['pescado', 'Filete de pescado', 'kg', 14, 8, 160],
  ['salmon', 'Salmón', 'kg', 6.5, 4, 420], ['arroz', 'Arroz', 'kg', 38, 10, 28], ['frijol', 'Frijol', 'kg', 22, 8, 34],
  ['tortilla', 'Tortilla de maíz', 'pza', 2400, 600, 0.6], ['tortilla_harina', 'Tortilla de harina', 'pza', 160, 60, 2.4], ['verdura', 'Verdura mixta', 'kg', 30, 12, 32],
  ['queso', 'Queso fresco', 'kg', 9, 4, 140], ['quinoa', 'Quinoa', 'kg', 5, 2, 95], ['aguacate', 'Aguacate', 'pza', 34, 20, 9],
  ['lechuga', 'Lechuga orejona', 'kg', 7, 4, 38], ['fruta', 'Fruta de temporada', 'kg', 18, 8, 30], ['yogur', 'Yogur natural', 'l', 11, 5, 42],
  ['granola', 'Granola', 'kg', 3.5, 1.5, 110], ['agua_fresca', 'Agua del día', 'l', 60, 20, 6], ['agua_botella', 'Agua 600 ml', 'pza', 120, 48, 6.5],
];
const EMPLOYEES = [
  ['10021', 'Mariana López', 'Finanzas'], ['10022', 'Jorge Ramírez', 'Tecnología'], ['10023', 'Fernanda Ruiz', 'Recursos Humanos'],
  ['10024', 'Diego Hernández', 'Operaciones'], ['10025', 'Sofía Martínez', 'Comercial'], ['10026', 'Luis García', 'Tecnología'],
  ['10027', 'Ana Torres', 'Jurídico'], ['10028', 'Carlos Gómez', 'Operaciones'],
];
const LIKED = ['sabor', 'porción', 'temperatura', 'presentación', 'rapidez'];
const COMMENTS = [['', 'Más opciones vegetarianas'], ['Algo salado', 'Menos sal en el arroz'], ['', ''], ['Tardó en salir', 'Más personal en hora pico'],
  ['', 'Que el menú premium tenga más variedad'], ['La sopa llegó tibia', 'Mantener la sopa caliente'], ['', '']];

function rng(seed) { let s = seed; return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31); }

export function seedMesa({ force = false } = {}) {
  const d = mdb();
  if (!force && d.prepare('SELECT COUNT(*) n FROM mesa_items').get().n > 0) return { skipped: true };
  const rand = rng(7);
  const pick = (a) => a[Math.floor(rand() * a.length)];
  let items, emps;
  d.exec('BEGIN');
  try {
    items = ITEMS.map(([name, category, price, kcal, emoji, description, recipe]) => {
      const id = uid('it_');
      d.prepare('INSERT INTO mesa_items (id, name, description, category, price_mxn, benefit_eligible, kcal, emoji, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(id, name, description, category, price, category === 'premium' ? 0 : 1, kcal, emoji, Date.now());
      for (const [ing, qty] of Object.entries(recipe)) d.prepare('INSERT INTO mesa_recipes (item_id, ingredient_id, qty) VALUES (?,?,?)').run(id, ing, qty);
      return { id, name, category, price };
    });
    for (const [id, name, unit, stock, min, cost] of INGREDIENTS) {
      d.prepare('INSERT INTO mesa_ingredients (id, name, unit, stock, min_stock, unit_cost) VALUES (?,?,?,?,?,?)').run(id, name, unit, stock, min, cost);
    }
    emps = EMPLOYEES.map(([number, name, area]) => {
      const id = uid('emp_');
      const email = `${name.split(' ')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}.demo@example.com`;
      d.prepare('INSERT INTO mesa_employees (id, number, name, email, area, pin, benefit_monthly, benefit_balance) VALUES (?,?,?,?,?,?,?,?)')
        .run(id, number, name, email, area, '1234', 1700, 1700 - Math.round(rand() * 900));
      return id;
    });

    d.exec('COMMIT');
  } catch (e) { d.exec('ROLLBACK'); throw e; }
  return { items: items.length, employees: emps.length, ...topUpMesa() };
}

/**
 * Mantiene vivo el demo (se llama al arrancar y cada hora): menú de los próximos 7 días,
 * historial de los 14 días anteriores y, si hoy hay pocos pedidos, pedidos recientes en cocina
 * para que el pase y la pantalla de salida tengan movimiento. Nunca toca días que ya tienen datos.
 */
export function topUpMesa({ seed = Date.now() % 100_000 } = {}) {
  const d = mdb();
  const rand = rng(seed);
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const items = d.prepare('SELECT * FROM mesa_items WHERE active = 1').all();
  const emps = d.prepare('SELECT id FROM mesa_employees').all().map((e) => e.id);
  if (!items.length) return { orders: 0 };
  const mains = items.filter((i) => i.category === 'menu' && !/vegetariano/i.test(i.name));
  const veggie = items.find((i) => /vegetariano/i.test(i.name));
  let orders = 0;

  d.exec('BEGIN');
  try {
    for (let off = -14; off <= 7; off++) {
      const date = today(off);
      if (d.prepare('SELECT COUNT(*) n FROM mesa_menu WHERE date = ?').get(date).n) continue;
      const dayNo = Math.floor(Date.parse(`${date}T12:00:00Z`) / 86_400_000);
      const plate = [mains[dayNo % mains.length], veggie, ...items.filter((i) => i.category !== 'menu')].filter(Boolean);
      for (const it of [...new Set(plate)]) {
        const qty = it.category === 'menu' ? 60 : it.category === 'premium' ? 14 : 18;
        d.prepare('INSERT INTO mesa_menu (id, date, item_id, planned_qty) VALUES (?,?,?,?)').run(uid('mn_'), date, it.id, qty);
      }
    }
    for (let off = -14; off <= 0; off++) {
      const date = today(off);
      const existing = d.prepare("SELECT COUNT(*) n FROM mesa_orders WHERE date = ?").get(date).n;
      if (off < 0 && existing) continue;
      if (off === 0 && existing >= 10) continue;
      const menu = d.prepare('SELECT i.* FROM mesa_menu m JOIN mesa_items i ON i.id = m.item_id WHERE m.date = ?').all(date);
      const n = off < 0 ? 120 + Math.floor(rand() * 30) : 14;
      for (let k = 0; k < n; k++) {
        // Historial: servicio de 12:01 a 15:30. Hoy: pedidos de los últimos 45 minutos.
        const base = off < 0 ? Date.parse(`${date}T12:00:00-06:00`) + Math.floor(rand() * 210) * 60_000 + 60_000 : Date.now() - (45 - k * 3) * 60_000;
        const roll = rand();
        const lines = [pick(menu.filter((i) => i.category === (roll < 0.66 ? 'menu' : roll < 0.8 ? 'premium' : 'grab_go')))];
        if (rand() < 0.3) lines.push(pick(menu.filter((i) => i.category === 'grab_go')));
        if (lines.some((i) => !i)) continue;
        const total = lines.reduce((a, i) => a + i.price_mxn, 0);
        const eligible = lines.filter((i) => i.benefit_eligible).reduce((a, i) => a + i.price_mxn, 0);
        const emp = rand() < 0.88 ? pick(emps) : null;
        const benefit = emp ? eligible : 0;
        const prep = (5 + Math.floor(rand() * 12)) * 60_000;
        const floor = (1 + Math.floor(rand() * 9)) * 60_000;
        const age = Date.now() - base;
        // Hoy, el estado depende de la antigüedad: los más viejos ya se entregaron.
        const stage = off < 0 ? 'delivered' : age > 30 * 60_000 ? 'delivered' : age > 18 * 60_000 ? 'ready' : age > 6 * 60_000 ? 'preparing' : 'paid';
        const readyAt = off < 0 ? base + prep : Math.min(base + prep, Date.now() - 60_000);
        const id = uid('ord_');
        d.prepare(`INSERT INTO mesa_orders (id, code, date, employee_id, channel, status, total, benefit_used, card_paid, created_at, preparing_at, ready_at, delivered_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, shortCode(4), date, emp, rand() < 0.62 ? 'web' : 'kiosk', stage, total, benefit, total - benefit, base,
          stage !== 'paid' ? base + 60_000 : null, ['ready', 'delivered'].includes(stage) ? readyAt : null,
          stage === 'delivered' ? Math.min(readyAt + floor, Date.now()) : null);
        for (const it of lines) d.prepare('INSERT INTO mesa_order_items (order_id, item_id, qty, price_mxn) VALUES (?,?,?,?)').run(id, it.id, 1, it.price_mxn);
        if (stage === 'delivered' && emp && off < 0) {
          const answered = rand() < 0.58;
          const rating = Math.min(5, Math.max(1, Math.round(4.3 + (rand() - 0.6) * 2.6)));
          const [dis, imp] = pick(COMMENTS);
          d.prepare('INSERT INTO mesa_surveys (id, order_id, employee_id, sent_at, rating, liked, disliked, improve, answered_at) VALUES (?,?,?,?,?,?,?,?,?)')
            .run(uid('sv_'), id, emp, base + prep + floor + 300_000, answered ? rating : null, answered ? [pick(LIKED), pick(LIKED)].join(',') : null,
              answered ? dis : null, answered ? imp : null, answered ? base + prep + floor + 3_600_000 : null);
        }
        orders++;
      }
    }
    d.exec('COMMIT');
  } catch (e) { d.exec('ROLLBACK'); throw e; }
  return { orders };
}
