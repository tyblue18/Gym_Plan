/**
 * GET /api/food/search?q=chicken+breast
 *
 * Queries USDA FoodData Central AND Open Food Facts in PARALLEL, then merges,
 * de-dupes, and RANKS the combined set by relevance to the query before
 * returning the top results. This fixes the two big problems with the old
 * either/or approach:
 *   - whole foods (USDA, lab-analysed) and common branded items (OFF) now
 *     appear together in one list
 *   - the closest name match is surfaced first instead of the source's raw order
 *
 * USDA needs USDA_API_KEY for reliable usage (DEMO_KEY is 30 req/hr per IP).
 * Results are cached in Redis for 24h. Both sources are normalised to one shape.
 */

import { NextResponse }      from 'next/server';
import { foodLimit }         from '@/lib/ratelimit';
import { Redis }             from '@upstash/redis';
import { foodSearchSchema }  from '@/lib/validators';

const redis = new Redis({
  url:   process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

interface NormalizedProduct {
  product_name:     string;
  brands?:          string;
  serving_size:     string;
  serving_quantity: number;
  source:           'usda' | 'off';
  nutriments: {
    'energy-kcal_100g': number;
    proteins_100g:       number;
    carbohydrates_100g:  number;
    fat_100g:            number;
  };
}

// ── Plausibility guard ────────────────────────────────────────────────────────
// Reject garbage (0 / absurd kcal, negative macros) but tolerate the legitimate
// gap between Atwater macro math and the label kcal: fiber, sugar alcohols, and
// rounding routinely push real foods past a tight absolute threshold. We allow
// the larger of 50 kcal or 25% of the energy value.
function plausible(kcal: number, protein: number, carbs: number, fat: number): boolean {
  if (kcal <= 0 || kcal > 900) return false;
  if (protein < 0 || carbs < 0 || fat < 0) return false;
  const macro = protein * 4 + carbs * 4 + fat * 9;
  if (macro === 0) return true; // no macro data — trust the kcal value
  const tolerance = Math.max(50, kcal * 0.25);
  return Math.abs(macro - kcal) <= tolerance;
}

// ── Relevance ranking ──────────────────────────────────────────────────────────

function queryWords(q: string): string[] {
  return q.toLowerCase().split(/\s+/).filter(w => w.length > 1);
}

/** Higher = more relevant. Rewards exact/prefix/substring matches and full word
 *  coverage; penalises long verbose descriptions so concise generic names win. */
function scoreResult(p: NormalizedProduct, q: string, qWords: string[]): number {
  const name = p.product_name.toLowerCase();
  let s = 0;
  if (name === q)            s += 100;
  else if (name.startsWith(q)) s += 60;
  else if (name.includes(q)) s += 30;

  const present = qWords.filter(w => name.includes(w)).length;
  s += present * 12;
  if (qWords.length > 0 && present === qWords.length) s += 25; // all terms present

  // Prefer concise names (a verbose clinical description is rarely what's wanted).
  s -= Math.min(18, Math.floor(name.length / 14));
  // USDA whole-food entries are lab-accurate — small tiebreaker bump.
  if (p.source === 'usda') s += 4;
  return s;
}

/** Group near-duplicate names (e.g. USDA + OFF both have "chicken breast"). */
function dedupeKey(p: NormalizedProduct): string {
  const name  = p.product_name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const brand = (p.brands ?? '').toLowerCase().trim();
  return `${name}|${brand}`;
}

// ── USDA FoodData Central ─────────────────────────────────────────────────────

interface USDANutrient { nutrientId?: number; value?: number; amount?: number }
interface USDAFood     { description: string; dataType: string; foodNutrients: USDANutrient[] }

function usda_get(ns: USDANutrient[], id: number): number {
  const n = ns.find(n => n.nutrientId === id);
  return n ? (n.value ?? n.amount ?? 0) : 0;
}

function normalizeUSDA(f: USDAFood): NormalizedProduct | null {
  const kcal    = Math.round(usda_get(f.foodNutrients, 1008));
  const protein = Math.round(usda_get(f.foodNutrients, 1003) * 10) / 10;
  const carbs   = Math.round(usda_get(f.foodNutrients, 1005) * 10) / 10;
  const fat     = Math.round(usda_get(f.foodNutrients, 1004) * 10) / 10;
  if (!plausible(kcal, protein, carbs, fat)) return null;
  return {
    product_name:     f.description.replace(/,\s*NFS$/i, '').trim(),
    serving_size:     '100g',
    serving_quantity: 100,
    source:           'usda',
    nutriments: { 'energy-kcal_100g': kcal, proteins_100g: protein, carbohydrates_100g: carbs, fat_100g: fat },
  };
}

async function searchUSDA(q: string, key: string): Promise<NormalizedProduct[]> {
  const res = await fetch(
    `https://api.nal.usda.gov/fdc/v1/foods/search` +
    `?query=${encodeURIComponent(q)}&api_key=${key}&pageSize=30` +
    `&dataType=Foundation,SR%20Legacy,Survey%20(FNDDS)`,
    { next: { revalidate: 300 }, signal: AbortSignal.timeout(5000) }
  );
  if (!res.ok) throw Object.assign(new Error('usda_fail'), { status: res.status });
  const data = await res.json() as { foods?: USDAFood[] };
  return (data.foods ?? []).map(normalizeUSDA).filter((p): p is NormalizedProduct => p !== null);
}

// ── Open Food Facts (text search) ─────────────────────────────────────────────

interface OFFRaw {
  product_name?: string;
  brands?: string;
  nutriments?: Record<string, number>;
}

function normalizeOFF(p: OFFRaw): NormalizedProduct | null {
  const name = p.product_name?.trim();
  if (!name) return null;
  const n     = p.nutriments ?? {};
  const kcal  = Math.round(n['energy-kcal_100g'] ?? 0);
  const prot  = Math.round((n['proteins_100g']       ?? 0) * 10) / 10;
  const carbs = Math.round((n['carbohydrates_100g']   ?? 0) * 10) / 10;
  const fat   = Math.round((n['fat_100g']             ?? 0) * 10) / 10;
  if (!plausible(kcal, prot, carbs, fat)) return null;
  return {
    product_name:     name,
    brands:           p.brands?.split(',')[0]?.trim(),
    serving_size:     '100g',
    serving_quantity: 100,
    source:           'off',
    nutriments: { 'energy-kcal_100g': kcal, proteins_100g: prot, carbohydrates_100g: carbs, fat_100g: fat },
  };
}

async function searchOFF(q: string): Promise<NormalizedProduct[]> {
  const res = await fetch(
    `https://world.openfoodfacts.org/cgi/search.pl` +
    `?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1` +
    `&page_size=30&sort_by=unique_scans_n&lc=en` +
    `&fields=product_name,brands,nutriments`,
    { next: { revalidate: 300 }, signal: AbortSignal.timeout(5000) }
  );
  if (!res.ok) return [];
  const data = await res.json() as { products?: OFFRaw[] };
  return (data.products ?? [])
    .map(normalizeOFF)
    .filter((p): p is NormalizedProduct => p !== null);
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<NextResponse> {
  const qRaw = new URL(req.url).searchParams.get('q')?.trim();
  const qParsed = foodSearchSchema.safeParse({ q: qRaw });
  if (!qParsed.success) return NextResponse.json({ products: [] });
  const q = qParsed.data.q.toLowerCase();

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anon';
  const { success } = await foodLimit.limit(ip);
  if (!success) return NextResponse.json({ products: [], error: 'Rate limited' }, { status: 429 });

  const cacheKey = `food:v2:${q}`;
  const cached   = await redis.get<{ products: NormalizedProduct[]; source: string }>(cacheKey);
  if (cached) return NextResponse.json({ ...cached, cached: true });

  const apiKey  = process.env.USDA_API_KEY ?? 'DEMO_KEY';
  const qWords  = queryWords(q);

  // Query BOTH sources in parallel; either failing just yields the other's hits.
  const [usdaRes, offRes] = await Promise.allSettled([
    searchUSDA(q, apiKey),
    searchOFF(q),
  ]);
  const usda = usdaRes.status === 'fulfilled' ? usdaRes.value : [];
  const off  = offRes.status  === 'fulfilled' ? offRes.value  : [];

  // Merge, keep only results that contain at least one query word (relevance
  // floor), rank by score, then de-dupe keeping the highest-ranked of each name.
  const ranked = [...usda, ...off]
    .filter(p => qWords.length === 0 || qWords.some(w => p.product_name.toLowerCase().includes(w)))
    .map(p => ({ p, score: scoreResult(p, q, qWords) }))
    .sort((a, b) => b.score - a.score);

  const seen: Set<string> = new Set();
  const products: NormalizedProduct[] = [];
  for (const { p } of ranked) {
    const key = dedupeKey(p);
    if (seen.has(key)) continue;
    seen.add(key);
    products.push(p);
    if (products.length >= 12) break;
  }

  const source = usda.length && off.length ? 'merged' : usda.length ? 'usda' : off.length ? 'off' : 'none';
  const result = { products, source };

  if (products.length > 0) {
    await redis.setex(cacheKey, 86_400, result);
  }

  return NextResponse.json(result);
}
