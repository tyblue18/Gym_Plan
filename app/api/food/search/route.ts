/**
 * GET /api/food/search?q=chicken+breast
 *
 * Strategy (most-accurate → most-available):
 *   1. USDA FoodData Central  — lab-analysed, per-100g data. Needs api_key for
 *      reliable usage (free: fdc.nal.usda.gov/api-key-signup.html → USDA_API_KEY
 *      in Vercel env vars; DEMO_KEY is limited to 30 req/hr per IP).
 *   2. Open Food Facts (text) — automatic fallback when USDA is rate-limited or
 *      returns nothing. No key, no rate limit, 3 M+ products worldwide.
 *
 * Both sources are normalised to identical shape so the client needs no changes.
 */

import { NextResponse } from 'next/server';
import { foodLimit }   from '@/lib/ratelimit';
import { Redis }       from '@upstash/redis';

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
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

function plausible(kcal: number, protein: number, carbs: number, fat: number): boolean {
  if (kcal <= 0 || kcal > 900) return false;
  if (protein < 0 || carbs < 0 || fat < 0) return false;
  const macro = protein * 4 + carbs * 4 + fat * 9;
  return macro === 0 || Math.abs(macro - kcal) < 35;
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
    { next: { revalidate: 300 } }
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

function normalizeOFF(p: OFFRaw, q: string): NormalizedProduct | null {
  const name = p.product_name?.trim();
  if (!name) return null;
  // Keep only results whose name contains at least one query word (relevance guard)
  const words = q.toLowerCase().split(/\s+/);
  const nameLower = name.toLowerCase();
  if (!words.some(w => w.length > 2 && nameLower.includes(w))) return null;

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
    { next: { revalidate: 300 } }
  );
  if (!res.ok) return [];
  const data = await res.json() as { products?: OFFRaw[] };
  return (data.products ?? [])
    .map(p => normalizeOFF(p, q))
    .filter((p): p is NormalizedProduct => p !== null);
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<NextResponse> {
  const q = new URL(req.url).searchParams.get('q')?.trim();
  if (!q) return NextResponse.json({ products: [] });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anon';
  const { success } = await foodLimit.limit(ip);
  if (!success) return NextResponse.json({ products: [], error: 'Rate limited' }, { status: 429 });

  // ── Cache check (24 h TTL) ─────────────────────────────────────────────────
  const cacheKey = `food:${q.toLowerCase()}`;
  const cached   = await redis.get<{ products: NormalizedProduct[]; source: string }>(cacheKey);
  if (cached) return NextResponse.json({ ...cached, cached: true });

  const apiKey = process.env.USDA_API_KEY ?? 'DEMO_KEY';

  // Try USDA first (better accuracy for raw/generic foods)
  let products: NormalizedProduct[] = [];
  let source: 'usda' | 'off' | 'none' = 'none';

  try {
    const usda = await searchUSDA(q, apiKey);
    if (usda.length > 0) { products = usda; source = 'usda'; }
  } catch {
    // USDA unavailable or rate-limited — fall through to OFF
  }

  // Fall back to Open Food Facts if USDA gave nothing
  if (products.length === 0) {
    try {
      const off = await searchOFF(q);
      if (off.length > 0) { products = off; source = 'off'; }
    } catch {
      // Both failed
    }
  }

  const result = { products: products.slice(0, 12), source };

  // Cache successful results — skip if both sources failed
  if (products.length > 0) {
    await redis.setex(cacheKey, 86_400, result);
  }

  return NextResponse.json(result);
}
