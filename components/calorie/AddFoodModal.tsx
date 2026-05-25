'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Plus, X, Search, Camera, ChevronRight, BookOpen, Trash2,
} from 'lucide-react';
import type { FoodEntry } from '@/lib/AppContext';

// ── Custom / My Foods ─────────────────────────────────────────────────────────

export interface CustomFood {
  id:          string;
  name:        string;
  type:        'ingredient' | 'meal';
  kcal:        number;
  protein:     number;
  carbs:       number;
  fat:         number;
  servingDesc: string;
  createdAt:   number;
}

const MY_FOODS_KEY = 'queMyFoods';

function loadMyFoods(): CustomFood[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(MY_FOODS_KEY) ?? '[]'); }
  catch { return []; }
}
function saveMyFoods(foods: CustomFood[]) {
  localStorage.setItem(MY_FOODS_KEY, JSON.stringify(foods));
}

// ── Meal section constants ────────────────────────────────────────────────────

export const FIXED_MEALS = ['breakfast', 'lunch', 'dinner'] as const;
export const MEAL_LABELS: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };
export const DEFAULT_ORDER = ['breakfast', 'lunch', 'dinner'];

export function getMealLabel(id: string, order: string[]): string {
  if (FIXED_MEALS.includes(id as typeof FIXED_MEALS[number])) return MEAL_LABELS[id];
  const snacks = order.filter(m => !FIXED_MEALS.includes(m as typeof FIXED_MEALS[number]));
  return snacks.length === 1 ? 'Snack' : `Snack ${snacks.indexOf(id) + 1}`;
}

// ── SVG icons ─────────────────────────────────────────────────────────────────

function IngredientIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2a4 4 0 0 1 4 4c0 3-4 8-4 8S8 9 8 6a4 4 0 0 1 4-4z"/>
      <path d="M12 14v8M8 22h8"/>
    </svg>
  );
}
function MealIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 11l19-9-9 19-2-8-8-2z"/>
    </svg>
  );
}

// ── Open Food Facts types ─────────────────────────────────────────────────────

interface OFFNutriments {
  'energy-kcal_100g'?:    number;
  'energy-kcal_serving'?: number;
  proteins_100g?:         number;
  carbohydrates_100g?:    number;
  fat_100g?:              number;
}
export interface OFFProduct {
  code?: string;
  product_name: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments: OFFNutriments;
}

export function perServing(p: OFFProduct, servings: number): Pick<FoodEntry, 'kcal'|'protein'|'carbs'|'fat'> {
  const n   = p.nutriments;
  const g   = parseFloat(String(p.serving_quantity ?? '100')) || 100;
  const f   = (g / 100) * servings;
  return {
    kcal:    Math.round((n['energy-kcal_100g'] ?? 0) * f),
    protein: Math.round((n.proteins_100g      ?? 0) * f * 10) / 10,
    carbs:   Math.round((n.carbohydrates_100g ?? 0) * f * 10) / 10,
    fat:     Math.round((n.fat_100g           ?? 0) * f * 10) / 10,
  };
}

// ── Food detail sheet ─────────────────────────────────────────────────────────

function FoodDetailSheet({ product, barcode, onAdd, onBack }: {
  product: OFFProduct;
  barcode?: string;
  onAdd: (food: Omit<FoodEntry, 'id' | 'loggedAt' | 'meal'>, barcode?: string) => void;
  onBack: () => void;
}) {
  const [servings, setServings] = useState(1);
  const macros = perServing(product, servings);
  const servingDesc = product.serving_size ?? `${product.serving_quantity ?? 100}g`;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 mb-4">
        <button type="button" onClick={onBack} className="text-[var(--ink-2)] hover:text-[var(--accent)] transition-colors">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[13px] font-bold text-[var(--ink-0)] truncate">{product.product_name}</p>
          {product.brands && <p className="font-mono text-[9px] text-[var(--ink-3)]">{product.brands}</p>}
        </div>
      </div>

      {/* Macro preview */}
      <div className="rounded border border-[var(--line-2)] bg-[var(--bg-2)] p-3 mb-4">
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { label: 'Calories', value: macros.kcal, unit: 'kcal', accent: true },
            { label: 'Protein',  value: macros.protein, unit: 'g' },
            { label: 'Carbs',    value: macros.carbs,   unit: 'g' },
            { label: 'Fat',      value: macros.fat,     unit: 'g' },
          ].map(m => (
            <div key={m.label}>
              <p className="font-display text-[20px] leading-none" style={{ color: m.accent ? 'var(--accent)' : 'var(--ink-0)' }}>
                {m.value}
              </p>
              <p className="font-mono text-[8px] text-[var(--ink-3)] mt-0.5">{m.unit}</p>
              <p className="font-mono text-[7px] text-[var(--ink-3)] uppercase tracking-[0.5px]">{m.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Serving stepper */}
      <div className="mb-4">
        <p className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-[var(--ink-3)] mb-2">
          Servings · {servingDesc} each
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setServings(s => Math.max(0.5, +(s - 0.5).toFixed(1)))}
            className="w-10 h-10 flex items-center justify-center rounded-sm border border-[var(--line-2)] bg-[var(--bg-2)] text-[var(--ink-0)] text-xl hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
          >−</button>
          <span className="font-display tabular text-[26px] text-[var(--accent)] min-w-[48px] text-center leading-none">
            {servings}
          </span>
          <button
            type="button"
            onClick={() => setServings(s => +(s + 0.5).toFixed(1))}
            className="w-10 h-10 flex items-center justify-center rounded-sm border border-[var(--line-2)] bg-[var(--bg-2)] text-[var(--ink-0)] text-xl hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
          >+</button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onAdd({
          name: product.product_name,
          brand: product.brands,
          ...macros,
          servingDesc,
          servings,
        }, barcode)}
        className="que-btn-primary w-full py-4 mt-auto"
      >
        Add to Log
      </button>
    </div>
  );
}

// ── My Foods tab ─────────────────────────────────────────────────────────────

const EMPTY_FORM = { name: '', type: 'ingredient' as 'ingredient'|'meal', servingDesc: '1 serving', kcal: '', protein: '', carbs: '', fat: '' };

function MyFoodsTab({ onSelect }: { onSelect: (p: OFFProduct) => void }) {
  const [myFoods,   setMyFoods]   = useState<CustomFood[]>(() => loadMyFoods());
  const [creating,  setCreating]  = useState(false);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');

  const set = (k: keyof typeof EMPTY_FORM, v: string) => setForm(f => ({ ...f, [k]: v }));

  const save = () => {
    if (!form.name.trim())           { setFormError('Name is required.'); return; }
    if (!form.kcal || +form.kcal <= 0) { setFormError('Calories must be > 0.'); return; }
    const food: CustomFood = {
      id:          `${Date.now()}-${Math.random().toString(36).slice(2,5)}`,
      name:        form.name.trim(),
      type:        form.type,
      servingDesc: form.servingDesc.trim() || '1 serving',
      kcal:        +form.kcal,
      protein:     +form.protein || 0,
      carbs:       +form.carbs   || 0,
      fat:         +form.fat     || 0,
      createdAt:   Date.now(),
    };
    const updated = [...myFoods, food];
    saveMyFoods(updated);
    setMyFoods(updated);
    setCreating(false);
    setForm(EMPTY_FORM);
    setFormError('');
  };

  const remove = (id: string) => {
    const updated = myFoods.filter(f => f.id !== id);
    saveMyFoods(updated);
    setMyFoods(updated);
  };

  // serving_quantity must be 100 so perServing's formula (g/100)*servings = 1*servings
  const toOFF = (f: CustomFood): OFFProduct => ({
    product_name:     f.name,
    serving_size:     f.servingDesc,
    serving_quantity: 100,
    nutriments: {
      'energy-kcal_100g': f.kcal,
      proteins_100g:       f.protein,
      carbohydrates_100g:  f.carbs,
      fat_100g:            f.fat,
    },
  });

  if (creating) return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <button type="button" onClick={() => { setCreating(false); setFormError(''); }}
          className="text-[var(--ink-2)] hover:text-[var(--accent)] transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <p className="font-mono text-[11px] font-bold tracking-[1.5px] uppercase text-[var(--ink-1)]">New Food</p>
      </div>

      {/* Type toggle */}
      <div className="flex bg-[var(--bg-2)] border border-[var(--line)] rounded-sm p-1 gap-0.5">
        {([['ingredient','Ingredient', IngredientIcon], ['meal','Meal / Recipe', MealIcon]] as const).map(([val, label, Icon]) => (
          <button key={val} type="button"
            onClick={() => set('type', val)}
            className={['flex-1 flex items-center justify-center gap-2 py-2 rounded-sm font-mono text-[10px] font-bold tracking-[1px] uppercase transition-all',
              form.type === val ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'text-[var(--ink-2)] hover:text-[var(--ink-0)]'].join(' ')}
          >
            <Icon size={12} />{label}
          </button>
        ))}
      </div>

      <div>
        <label className="que-label">Name</label>
        <input type="text" className="que-input" placeholder={form.type === 'meal' ? 'e.g. Chicken & Rice Bowl' : 'e.g. Chicken Breast'}
          value={form.name} onChange={e => set('name', e.target.value)} />
      </div>
      <div>
        <label className="que-label">Serving description</label>
        <input type="text" className="que-input" placeholder="e.g. 1 serving, 100g, 1 cup"
          value={form.servingDesc} onChange={e => set('servingDesc', e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {([['kcal','Calories','numeric'],['protein','Protein / g','decimal'],['carbs','Carbs / g','decimal'],['fat','Fat / g','decimal']] as const).map(([k, label, mode]) => (
          <div key={k}>
            <label className="que-label">{label}{k !== 'kcal' && <span className="font-normal text-[var(--ink-3)] normal-case"> (opt)</span>}</label>
            <input type="number" inputMode={mode} className="que-input"
              value={(form as Record<string,string>)[k]} onChange={e => set(k, e.target.value)} />
          </div>
        ))}
      </div>

      {formError && <p className="font-mono text-[9px] text-[var(--danger)] tracking-[0.5px]">{formError}</p>}

      <button type="button" onClick={save} className="que-btn-primary w-full py-3">Save Food</button>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[9px] text-[var(--ink-3)] tracking-[0.5px]">
          {myFoods.length === 0 ? 'No saved foods yet' : `${myFoods.length} saved`}
        </p>
        <button type="button" onClick={() => { setCreating(true); setFormError(''); setForm(EMPTY_FORM); }}
          className="flex items-center gap-1.5 font-mono text-[9px] font-bold tracking-[1px] uppercase text-[var(--accent)] border border-[var(--accent)]/40 rounded-sm px-2.5 py-1 hover:bg-[var(--accent)]/10 transition-all">
          <Plus size={10} /> New
        </button>
      </div>

      {myFoods.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-[var(--line-2)] rounded">
          <p className="font-mono text-[10px] text-[var(--ink-3)] tracking-[1px] uppercase">Save ingredients &amp; meals</p>
          <p className="font-mono text-[9px] text-[var(--ink-3)] mt-1 tracking-[0.5px]">Tap New to create a custom food</p>
        </div>
      ) : (
        <div className="rounded border border-[var(--line)] bg-[var(--bg-2)] divide-y divide-[var(--line)]">
          {myFoods.sort((a, b) => b.createdAt - a.createdAt).map(f => (
            <div key={f.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className={['flex-shrink-0 w-7 h-7 rounded-sm flex items-center justify-center',
                f.type === 'meal' ? 'bg-[var(--positive)]/15 text-[var(--positive)]' : 'bg-[var(--accent)]/15 text-[var(--accent)]'].join(' ')}>
                {f.type === 'meal' ? <MealIcon size={14} /> : <IngredientIcon size={14} />}
              </span>
              <button type="button" onClick={() => onSelect(toOFF(f))} className="flex-1 min-w-0 text-left">
                <p className="font-mono text-[11px] font-semibold text-[var(--ink-0)] truncate">{f.name}</p>
                <p className="font-mono text-[9px] text-[var(--ink-3)]">{f.servingDesc} · {f.kcal} kcal</p>
              </button>
              <button type="button" onClick={() => remove(f.id)}
                className="text-[var(--ink-3)] hover:text-[var(--danger)] transition-colors flex-shrink-0 p-1">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Add food modal ────────────────────────────────────────────────────────────

export function AddFoodModal({ open, onClose, onAdd }: {
  open: boolean;
  onClose: () => void;
  onAdd: (food: Omit<FoodEntry, 'id' | 'loggedAt' | 'meal'>, barcode?: string) => void;
}) {
  const [mode,            setMode]           = useState<'scan' | 'search' | 'myfoods'>('scan');
  const [searchQuery,     setSearchQuery]    = useState('');
  const [searchResults,   setSearchResults]  = useState<OFFProduct[]>([]);
  const [searching,       setSearching]      = useState(false);
  const [manualBarcode,   setManualBarcode]  = useState('');
  const [selectedProduct, setSelectedProduct] = useState<{ p: OFFProduct; barcode?: string } | null>(null);
  const [error,           setError]          = useState('');
  const [scanning,        setScanning]       = useState(false);
  const videoRef      = useRef<HTMLVideoElement>(null);
  const controlsRef   = useRef<{ stop: () => void } | null>(null);
  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setMode('scan'); setSearchQuery(''); setSearchResults([]);
      setManualBarcode(''); setSelectedProduct(null); setError('');
      stopCamera();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopCamera = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setScanning(false);
  };

  const startCamera = useCallback(async () => {
    console.log('[cam] startCamera called');
    setError('');
    setScanning(true);

    // ── 1. API availability ──────────────────────────────────────────────────
    if (!navigator.mediaDevices?.getUserMedia) {
      console.log('[cam] getUserMedia not available');
      setScanning(false);
      setError('Camera API not available. Try HTTPS or a supported browser.');
      return;
    }

    // ── 2. Open camera stream ────────────────────────────────────────────────
    let stream: MediaStream;
    try {
      console.log('[cam] calling getUserMedia...');
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      console.log('[cam] stream obtained', stream.getVideoTracks()[0]?.label);
    } catch (err) {
      console.log('[cam] getUserMedia error', err);
      setScanning(false);
      setError(
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Camera permission denied — tap Allow when your browser asks, or check site settings.'
          : `Camera error (${err instanceof Error ? err.name : 'unknown'}). Try the barcode field below.`
      );
      return;
    }

    // ── 3. Attach to video element ───────────────────────────────────────────
    if (!videoRef.current) {
      console.log('[cam] videoRef.current is null');
      stream.getTracks().forEach(t => t.stop());
      setScanning(false);
      setError('Video element missing — please close and reopen this panel.');
      return;
    }

    const video = videoRef.current;
    console.log('[cam] attaching stream to video element');
    video.srcObject = stream;

    let active = true;
    controlsRef.current = {
      stop: () => {
        active = false;
        stream.getTracks().forEach(t => t.stop());
        if (videoRef.current) videoRef.current.srcObject = null;
      },
    };

    // ── 4. Play — retry on canplay if browser wasn't ready ───────────────────
    await new Promise<void>(resolve => {
      video.play()
        .then(() => { console.log('[cam] play() succeeded'); resolve(); })
        .catch(playErr => {
          console.log('[cam] play() failed, waiting for canplay...', playErr);
          const onCanPlay = () => {
            video.removeEventListener('canplay', onCanPlay);
            video.play()
              .then(() => console.log('[cam] play() on canplay succeeded'))
              .catch(e => console.log('[cam] play() on canplay failed', e))
              .finally(() => resolve());
          };
          video.addEventListener('canplay', onCanPlay);
          setTimeout(() => { video.removeEventListener('canplay', onCanPlay); console.log('[cam] canplay timeout'); resolve(); }, 5000);
        });
    });
    console.log('[cam] video readyState after play:', video.readyState, 'paused:', video.paused);

    // ── 5. Barcode detection (failures never hide the camera) ────────────────
    if ('BarcodeDetector' in window) {
      console.log('[cam] using BarcodeDetector');
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detector = new (window as any).BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
        });
        const tick = async () => {
          if (!active) return;
          if (video.readyState >= 2) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const codes: any[] = await detector.detect(video);
              if (codes.length > 0) {
                controlsRef.current?.stop();
                controlsRef.current = null;
                setScanning(false);
                void lookupBarcode(codes[0].rawValue);
                return;
              }
            } catch { /* no barcode this frame */ }
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      } catch (e) {
        console.log('[cam] BarcodeDetector init error', e);
      }
    } else {
      console.log('[cam] BarcodeDetector not available, using ZXing');
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromStream(
          stream,
          video,
          (result, _err, ctrl) => {
            if (result) {
              ctrl.stop();
              controlsRef.current = null;
              setScanning(false);
              void lookupBarcode(result.getText());
            }
          },
        );
        controlsRef.current = controls;
      } catch (e) {
        console.log('[cam] ZXing error', e);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const lookupBarcode = async (code: string) => {
    setError('');
    setSearching(true);
    try {
      const res  = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`);
      const data = await res.json() as { status: number; product?: OFFProduct };
      if (data.status === 1 && data.product?.product_name) {
        setSelectedProduct({ p: data.product, barcode: code });
      } else {
        setError(`No product found for barcode ${code}. Try searching by name.`);
      }
    } catch {
      setError('Network error. Check your connection.');
    } finally {
      setSearching(false);
    }
  };

  const runSearch = useCallback(async (q: string) => {
    const query = q.trim();
    if (!query) return;
    setSearching(true); setError(''); setSearchResults([]);
    try {
      const res  = await fetch(`/api/food/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error('fetch_failed');
      const data = await res.json() as { products?: OFFProduct[]; source?: string };
      const results = data.products ?? [];
      setSearchResults(results);
      if (results.length === 0) {
        setError('No results — try a simpler term (e.g. "chicken breast" not "grilled lemon chicken").');
      }
    } catch {
      setError('Search unavailable. Use the barcode scanner or add via My Foods.');
    } finally {
      setSearching(false);
    }
  }, []);

  const handleSearchChange = useCallback((val: string) => {
    setSearchQuery(val);
    setSearchResults([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length >= 2) {
      debounceRef.current = setTimeout(() => runSearch(val), 500);
    }
  }, [runSearch]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[300] flex items-end md:items-center justify-center backdrop-blur-sm px-0 md:px-3"
          style={{ background: 'rgba(7,8,10,0.88)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={e => { if (e.target === e.currentTarget) { stopCamera(); onClose(); } }}
        >
          <motion.div
            className="w-full md:max-w-[480px] h-[88dvh] flex flex-col rounded-t-lg md:rounded-lg border border-[var(--line-2)] bg-[var(--bg-1)] overflow-hidden"
            initial={{ opacity: 0, y: 48 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 48 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            style={{ boxShadow: '0 0 0 1px var(--line-2), 0 -2px 0 0 var(--accent), 0 40px 80px rgba(0,0,0,0.6)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[var(--line)] flex-shrink-0">
              <h3 className="font-display text-[20px] tracking-[2px] uppercase text-[var(--ink-0)]">Add Food</h3>
              <button onClick={() => { stopCamera(); onClose(); }} className="text-[var(--ink-2)] hover:text-[var(--accent)] transition-colors p-1">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain p-4 md:p-5">
              {selectedProduct ? (
                <FoodDetailSheet
                  product={selectedProduct.p}
                  barcode={selectedProduct.barcode}
                  onAdd={onAdd}
                  onBack={() => setSelectedProduct(null)}
                />
              ) : (
                <>
                  {/* Mode tabs */}
                  <div className="flex bg-[var(--bg-2)] border border-[var(--line)] rounded-sm p-1 gap-0.5 mb-4">
                    {([
                    ['scan',    'Scan',     Camera],
                    ['search',  'Search',   Search],
                    ['myfoods', 'My Foods', BookOpen],
                  ] as const).map(([id, label, Icon]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => { setMode(id); stopCamera(); setError(''); }}
                        className={[
                          'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-sm font-mono text-[9px] font-bold tracking-[0.5px] uppercase transition-all',
                          mode === id ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'text-[var(--ink-2)] hover:text-[var(--ink-0)]',
                        ].join(' ')}
                      >
                        <Icon size={12} />
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* ── SCAN MODE ── */}
                  {mode === 'scan' && (
                    <div className="space-y-4">
                      {/* Live camera view — works on iOS Safari, Android Chrome, Firefox */}
                      <div className="relative rounded border border-[var(--line-2)] bg-[var(--bg-2)] overflow-hidden aspect-[4/3]">
                        <video
                          ref={videoRef}
                          className="block w-full h-full object-cover"
                          playsInline muted autoPlay
                        />
                        {!scanning && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--bg-2)]">
                            <Camera size={40} className="text-[var(--ink-3)]" />
                            <p className="font-mono text-[10px] text-[var(--ink-3)] tracking-[1px] uppercase">
                              Point camera at barcode
                            </p>
                          </div>
                        )}
                        {scanning && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-52 h-24 border-2 border-[var(--accent)] rounded opacity-80" />
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={scanning ? stopCamera : startCamera}
                        className={scanning ? 'que-btn-ghost w-full py-3' : 'que-btn-primary w-full py-3'}
                      >
                        {scanning ? 'Stop Camera' : 'Start Camera'}
                      </button>

                      {/* Manual barcode entry */}
                      <div>
                        <label className="que-label">Barcode number</label>
                        <div className="flex gap-2">
                          <input
                            type="text" inputMode="numeric" className="que-input flex-1"
                            placeholder="e.g. 3017620422003"
                            value={manualBarcode}
                            onChange={e => setManualBarcode(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && manualBarcode && lookupBarcode(manualBarcode)}
                          />
                          <button
                            type="button"
                            onClick={() => manualBarcode && lookupBarcode(manualBarcode)}
                            disabled={!manualBarcode || searching}
                            className="que-btn-ghost px-4 flex-shrink-0 disabled:opacity-40"
                          >
                            {searching ? '…' : <ChevronRight size={16} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── SEARCH MODE ── */}
                  {mode === 'search' && (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <input
                          type="text" className="que-input flex-1"
                          placeholder="Search foods, brands…"
                          value={searchQuery}
                          onChange={e => handleSearchChange(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && runSearch(searchQuery)}
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => runSearch(searchQuery)}
                          disabled={!searchQuery.trim() || searching}
                          className="que-btn-primary px-4 flex-shrink-0 disabled:opacity-40"
                        >
                          {searching ? '…' : <Search size={16} />}
                        </button>
                      </div>

                      {searchResults.length > 0 && (
                        <div className="rounded border border-[var(--line)] bg-[var(--bg-2)] divide-y divide-[var(--line)]">
                          {searchResults.map((p, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setSelectedProduct({ p })}
                              className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-[var(--bg-3)] transition-colors"
                            >
                              <div className="min-w-0">
                                <p className="font-mono text-[11px] font-semibold text-[var(--ink-0)] truncate">{p.product_name}</p>
                                {p.brands && <p className="font-mono text-[9px] text-[var(--ink-3)] truncate">{p.brands}</p>}
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="font-mono text-[11px] font-bold text-[var(--accent)]">
                                  {Math.round(p.nutriments['energy-kcal_100g'] ?? 0)}
                                </p>
                                <p className="font-mono text-[8px] text-[var(--ink-3)]">kcal/100g</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Error */}
                  {error && (
                    <p className="font-mono text-[11px] text-[var(--warn)] mt-3 tracking-[0.3px] border border-[var(--warn)]/30 rounded px-3 py-2 bg-[var(--warn)]/10">{error}</p>
                  )}

                  {searching && !searchResults.length && (
                    <p className="font-mono text-[9px] text-[var(--ink-3)] mt-3 text-center tracking-[1px] uppercase animate-pulse">
                      Searching…
                    </p>
                  )}

                  {/* ── MY FOODS MODE ── */}
                  {mode === 'myfoods' && (
                    <MyFoodsTab onSelect={p => setSelectedProduct({ p })} />
                  )}
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
