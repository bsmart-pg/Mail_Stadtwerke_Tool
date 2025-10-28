import React, { useEffect, useMemo, useState } from 'react';
import {
  EnvelopeIcon,
  TagIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';

import { getAllEmailsWithStatus, getCategories } from '../services/SupabaseService';
import { EMAIL_STATUS, IncomingEmail } from '../types/supabase';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title as ChartTitle,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';


// Inbox filter options from ENV
const inboxEmailAdress  = import.meta.env.VITE_INBOX_EMAIL_ADRESS  || '';
const inboxEmailAdress2 = import.meta.env.VITE_INBOX_EMAIL_ADRESS2 || '';
const inboxEmailAdress3 = import.meta.env.VITE_INBOX_EMAIL_ADRESS3 || '';
const inboxEmailAdress4 = import.meta.env.VITE_INBOX_EMAIL_ADRESS4 || '';

const inboxEmailList = [
  inboxEmailAdress,
  inboxEmailAdress2,
  inboxEmailAdress3,
  inboxEmailAdress4,
].filter(Boolean);


ChartJS.register(CategoryScale, LinearScale, BarElement, ChartTitle, Tooltip, Legend);

// ---- Helpers ---------------------------------------------------------------

const isWithinLastHours = (date: Date | string, hours = 24) =>
  Date.now() - new Date(date).getTime() <= hours * 60 * 60 * 1000;

const isHidden = (e: IncomingEmail) => e.status === EMAIL_STATUS.AUSGEBLENDET;
const isUnrecognizable = (e: IncomingEmail) => e.category === 'Sonstiges';
const isCategorized = (e: IncomingEmail) => !!e.category && e.category !== 'Sonstiges';
const isCustomerNumberMissing = (e: IncomingEmail) =>
  e.status === EMAIL_STATUS.FEHLENDE_KUNDENNUMMER;

type CategoryBucket = { name: string; count: number };

const TZ = 'Europe/Berlin';

function localYMD(date: Date | string, tz = TZ): string {
  const d = new Date(date);
  const parts = new Intl.DateTimeFormat('de-DE', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);

  const get = (type: string) => parts.find(p => p.type === type)?.value || '';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  return `${year}-${month}-${day}`;
}

function localShortLabel(date: Date, tz = TZ): string {
  const parts = new Intl.DateTimeFormat('de-DE', {
    timeZone: tz,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).formatToParts(date);

  const get = (type: string) => parts.find(p => p.type === type)?.value || '';
  const wd = get('weekday');
  const day = get('day');
  const month = get('month');
  return `${wd} ${day}.${month}.`;
}

function lastNDays(n = 7, tz = TZ): { keys: string[]; labels: string[] } {
  const dayMs = 24 * 60 * 60 * 1000;
  const now = new Date();
  const todayKey = localYMD(now, tz);

  const keys: string[] = [];
  const labels: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date(Date.now() - i * dayMs);
    const key = localYMD(dt, tz);
    keys.push(key);
    labels.push(localShortLabel(dt, tz));
  }

  if (keys[keys.length - 1] !== todayKey) {
    const dt = new Date();
    keys[keys.length - 1] = todayKey;
    labels[labels.length - 1] = localShortLabel(dt, tz);
  }

  return { keys, labels };
}

// Neu: Erzeuge Tages-Keys/Labels für beliebigen Bereich (inklusive beider Enden)
function dayKeysForRange(startYMD: string, endYMD: string, tz = TZ) {
  let s = startYMD;
  let e = endYMD;
  if (s && e && s > e) {
    [s, e] = [e, s];
  }
  const start = s ? new Date(s + 'T00:00:00') : new Date(endYMD + 'T00:00:00');
  const end = e ? new Date(e + 'T00:00:00') : new Date(startYMD + 'T00:00:00');

  // wir gehen von 00:00 lokaler Zeit aus; für Labels nehmen wir das Date-Objekt
  const keys: string[] = [];
  const labels: string[] = [];
  const dayMs = 24 * 60 * 60 * 1000;

  // Anzahl Tage inkl. beider Enden
  const days = Math.max(0, Math.round((end.getTime() - start.getTime()) / dayMs)) + 1;
  for (let i = 0; i < days; i++) {
    const dt = new Date(start.getTime() + i * dayMs);
    const key = localYMD(dt, tz);
    keys.push(key);
    labels.push(localShortLabel(dt, tz));
  }
  return { keys, labels };
}

// ----------------------------------------------------------------------------

const Dashboard: React.FC = () => {
  const [emails, setEmails] = useState<IncomingEmail[]>([]);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  // ---- Zeitfenster ---------------------------------------------------------
  // Default: letzte 7 Tage (inkl. heute)
  const dayMs = 24 * 60 * 60 * 1000;
  const todayYMD = localYMD(new Date(), TZ);
  const sevenDaysAgoYMD = localYMD(new Date(Date.now() - 6 * dayMs), TZ);

  const [range, setRange] = useState<{ start: string; end: string }>({
    start: sevenDaysAgoYMD,
    end: todayYMD,
  });

  // Filter: inbox (To-recipient mailbox)
  const [inboxFilter, setInboxFilter] = useState<string>('alle');

  // Build select options once (preserve casing)
  const inboxFilterOptions = useMemo(
    () => ['alle', ...inboxEmailList],
    []
  );

  const exportToExcel = () => {
    // Helpers
    const fmtRange = (ymd: string) =>
      ymd ? ymd.split('-').reverse().join('.') : '';
    const safePercent = (count: number, total: number) =>
      total > 0 ? ((count / total) * 100).toFixed(1).replace('.', ',') + ' %' : '0 %';

    // ---------- Sheet 1: Übersicht ----------
    const summaryRows = [{
      Zeitraum: `${fmtRange(range.start)} – ${fmtRange(range.end)}`,
      'Gesamt E-Mails': totalInRange,
      Kategorisiert: categorizedCount,
      'Nicht kategorisierbar': unrecognizableCount,
      'Fehlende Kundennummer': missingCustomerNumberCount,
      Postfach: inboxFilter === 'alle' ? 'Alle Postfächer' : inboxFilter,
    }];
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    wsSummary['!cols'] = [{ wch: 24 }, { wch: 16 }, { wch: 14 }, { wch: 22 }, { wch: 24 }, { wch: 22 }];

    // ---------- Sheet 2: Kategorien ----------
    const categoryRows = categoryBuckets.map(c => ({
      Kategorie: c.name,
      Anzahl: c.count,
      Anteil: safePercent(c.count, totalInRange),
    }));
    const wsCategories = XLSX.utils.json_to_sheet(categoryRows);
    wsCategories['!cols'] = [{ wch: 28 }, { wch: 10 }, { wch: 10 }];

    // ---------- Sheet 3: Tagesübersicht ----------
    // Uses the same keys/labels as the bar chart currently shown
    const dailyRows = chartKeys.map((key, i) => ({
      Datum: chartLabels[i],          // e.g., "Mi. 23.10."
      'E-Mail-Eingänge': (barData.datasets[0].data as number[])[i] || 0,
      'Datum (YYYY-MM-DD)': key,      // helpful raw key for further analysis
    }));
    const wsDaily = XLSX.utils.json_to_sheet(dailyRows);
    wsDaily['!cols'] = [{ wch: 16 }, { wch: 18 }, { wch: 16 }];

    // Freeze header rows for all sheets
    wsSummary['!freeze'] = { xSplit: 0, ySplit: 1 };
    wsCategories['!freeze'] = { xSplit: 0, ySplit: 1 };
    wsDaily['!freeze'] = { xSplit: 0, ySplit: 1 };

    // ---------- Build & download ----------
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Übersicht');
    XLSX.utils.book_append_sheet(wb, wsCategories, 'Kategorien');
    XLSX.utils.book_append_sheet(wb, wsDaily, 'Tagesübersicht');

    const fileName =
      `E-Mail-Dashboard_${range.start || 'alle'}_${range.end || 'alle'}.xlsx`.replace(/:/g, '-');
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
  };



  const setPreset = (preset: 'today' | '7d' | '30d' | 'week' | 'month' | 'all') => {
    const now = new Date();
    const end = localYMD(now, TZ);

    if (preset === 'today') {
      setRange({ start: end, end });
      return;
    }
    if (preset === '7d') {
      setRange({ start: localYMD(new Date(Date.now() - 6 * dayMs), TZ), end });
      return;
    }
    if (preset === '30d') {
      setRange({ start: localYMD(new Date(Date.now() - 29 * dayMs), TZ), end });
      return;
    }
    if (preset === 'week') {
      // Montag als Wochenstart (de-DE)
      const wd = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, weekday: 'short' })
        .formatToParts(now)
        .find(p => p.type === 'weekday')?.value || '';
      // hole lokalen Wochentag-Index: Mo=1..So=7
      const weekdayMap: Record<string, number> = {
        'Mo.': 1, 'Di.': 2, 'Mi.': 3, 'Do.': 4, 'Fr.': 5, 'Sa.': 6, 'So.': 7,
      };
      const idx = weekdayMap[wd] ?? 1;
      const monday = new Date(Date.now() - (idx - 1) * dayMs);
      setRange({ start: localYMD(monday, TZ), end });
      return;
    }
    if (preset === 'month') {
      const y = now.getFullYear();
      const m = now.getMonth(); // 0-basiert
      const firstOfMonth = new Date(y, m, 1);
      setRange({ start: localYMD(firstOfMonth, TZ), end });
      return;
    }
    if (preset === 'all') {
      // "alles" heißt: keine Einschränkung -> wir setzen start leer und end = heute
      setRange({ start: '', end: '' });
      return;
    }
  };

  const inSelectedRange = (date: Date | string) => {
    const key = localYMD(date, TZ);
    const hasStart = !!range.start;
    const hasEnd = !!range.end;
    if (hasStart && key < range.start) return false;
    if (hasEnd && key > range.end) return false;
    return true;
  };

  // Chart category filter (multi-select)
  const categoriesWithOther = useMemo(
    () => Array.from(new Set([...allCategories, 'Sonstiges'])),
    [allCategories]
  );
  const [chartCategoryFilter, setChartCategoryFilter] = useState<string[]>([]);

  // Load emails + categories from DB
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');

        const [emailData, categoryData] = await Promise.all([
          getAllEmailsWithStatus(),
          getCategories(),
        ]);

        setEmails(emailData || []);
        setAllCategories(
          (categoryData || []).map((c: any) => c.category_name).filter(Boolean)
        );
      } catch (err) {
        console.error('Fehler beim Laden der Dashboard-Daten:', err);
        setError('Fehler beim Laden der Daten.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  // Initialize chart filter once categories are known (keep selection if already chosen)
  useEffect(() => {
    if (chartCategoryFilter.length === 0 && categoriesWithOther.length > 0) {
      setChartCategoryFilter(categoriesWithOther);
    }
  }, [categoriesWithOther, chartCategoryFilter.length]);

  // Exclude hidden mails everywhere
  const visibleEmails = useMemo(
    () => emails.filter((e) => !isHidden(e)),
    [emails]
  );

  // ---- apply Zeitfilter + inbox filter ---------------------------------------
  const filteredEmails = useMemo(() => {
    return visibleEmails.filter((e) => {
      // Date window
      if (!inSelectedRange(e.received_date)) return false;

      // Inbox filter
      if (inboxFilter !== 'alle') {
        const to = String((e as any).to_recipients || '').trim().toLowerCase();
        if (to !== inboxFilter.trim().toLowerCase()) return false;
      }

      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleEmails, range.start, range.end, inboxFilter]);


  // Stats (ALLE bezogen auf gefilterte Mails)
  const totalInRange = filteredEmails.length;
  const categorizedCount = useMemo(
    () => filteredEmails.filter(isCategorized).length,
    [filteredEmails]
  );
  const unrecognizableCount = useMemo(
    () => filteredEmails.filter(isUnrecognizable).length,
    [filteredEmails]
  );
  const missingCustomerNumberCount = useMemo(
    () => filteredEmails.filter(isCustomerNumberMissing).length,
    [filteredEmails]
  );

  // Category distribution from DB categories + always include "Sonstiges" (gefiltert)
  const categoryBuckets: CategoryBucket[] = useMemo(() => {
    const buckets = categoriesWithOther.map((catName) => {
      const count = filteredEmails.reduce((acc, e) => {
        const cats: string[] =
          Array.isArray((e as any).all_categories) && (e as any).all_categories.length > 0
            ? (e as any).all_categories
            : (e.category ? [e.category] : []);
        return acc + (cats.includes(catName) ? 1 : 0);
      }, 0);

      return { name: catName, count };
    });

    return buckets.sort((a, b) => b.count - a.count);
  }, [categoriesWithOther, filteredEmails]);

  const maxCategoryCount =
    categoryBuckets.reduce((m, c) => Math.max(m, c.count), 0) || 1;

  // ---- Bar-Chart über ausgewählten Zeitraum --------------------------------

  // Wenn kein Start/Ende gesetzt ist ("Alles"), nehmen wir last 7 days der Daten,
  // damit das Chart dennoch sinnvoll ist.
  const fallback7 = useMemo(() => lastNDays(7, TZ), []);
  const { keys: chartKeys, labels: chartLabels } = useMemo(() => {
    if (!range.start || !range.end) {
      // "Alles" → wenn du magst: anhand min/max Datum aus Emails dynamisch bauen
      // einfache Variante: zeige die letzten 7 Tage
      return fallback7;
    }
    return dayKeysForRange(range.start, range.end, TZ);
  }, [range.start, range.end, fallback7]);

  // Emails included in the chart after category filter + Zeitraum
  const chartEmails = useMemo(() => {
    const base = filteredEmails;
    if (chartCategoryFilter.length === 0) return base;
    return base.filter((e) => {
      const cats: string[] =
        Array.isArray((e as any).all_categories) && (e as any).all_categories.length > 0
          ? (e as any).all_categories
          : (e.category ? [e.category] : []);
      return cats.some((c) => chartCategoryFilter.includes(c));
    });
  }, [filteredEmails, chartCategoryFilter]);

  // Build count map by Berlin-local day using filtered & category-selected emails
  const dayCountsMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of chartEmails) {
      const key = localYMD(e.received_date, TZ);
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [chartEmails]);

  const barData = useMemo(() => {
    const counts = chartKeys.map((k) => dayCountsMap.get(k) || 0);
    return {
      labels: chartLabels,
      datasets: [
        {
          label: 'Eingänge',
          data: counts,
          backgroundColor: 'rgba(37, 99, 235, 1)',     // blue-600
          borderColor: 'rgba(37, 99, 235, 1)',
          hoverBackgroundColor: 'rgba(29, 78, 216, 1)', // blue-700
          hoverBorderColor: 'rgba(29, 78, 216, 1)',
          borderWidth: 0,
        },
      ],
    };
  }, [dayCountsMap, chartKeys, chartLabels]);

  const barOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: any) => ` ${ctx.parsed.y} E-Mails`,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { precision: 0 },
        },
      },
    }),
    []
  );

  // UI helpers for the chip/checkbox list
  const toggleChartCategory = (name: string) => {
    setChartCategoryFilter((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  const selectAllChartCategories = () => setChartCategoryFilter(categoriesWithOther);
  const clearChartCategories = () => setChartCategoryFilter([]);

  // --------------------------------------------------------------------------

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
          <div className="flex items-center text-red-600">
            <ExclamationCircleIcon className="w-5 h-5 mr-2" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* ---- Zeitfilter UI -------------------------------------------------- */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="grid gap-4 md:grid-cols-3 md:items-end">
          {/* Left: Date inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:col-span-1">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Startdatum</label>
              <input
                type="date"
                className="border rounded-md px-3 py-2 w-full"
                value={range.start}
                onChange={(e) => setRange(r => ({ ...r, start: e.target.value }))}
                max={range.end || todayYMD}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Enddatum</label>
              <input
                type="date"
                className="border rounded-md px-3 py-2 w-full"
                value={range.end}
                onChange={(e) => setRange(r => ({ ...r, end: e.target.value }))}
                min={range.start || ''}
                max={todayYMD}
              />
            </div>
          </div>

          {/* Center: Schnellauswahl */}
          <div className="flex flex-wrap justify-center items-center gap-2 md:col-span-1">
            <span className="text-sm text-gray-600 whitespace-nowrap">Schnellauswahl:</span>
            <button onClick={() => setPreset('today')} className="px-2 py-1 text-xs rounded-md border bg-gray-50 hover:bg-gray-100">Heute</button>
            <button onClick={() => setPreset('7d')} className="px-2 py-1 text-xs rounded-md border bg-gray-50 hover:bg-gray-100">Letzte 7 Tage</button>
            <button onClick={() => setPreset('30d')} className="px-2 py-1 text-xs rounded-md border bg-gray-50 hover:bg-gray-100">Letzte 30 Tage</button>
            <button onClick={() => setPreset('week')} className="px-2 py-1 text-xs rounded-md border bg-gray-50 hover:bg-gray-100">Diese Woche</button>
            <button onClick={() => setPreset('month')} className="px-2 py-1 text-xs rounded-md border bg-gray-50 hover:bg-gray-100">Dieser Monat</button>
            <button onClick={() => setPreset('all')} className="px-2 py-1 text-xs rounded-md border bg-gray-50 hover:bg-gray-100">Alles</button>
          </div>

          {/* Right: Postfach + Export */}
          <div className="flex items-center justify-end gap-2 whitespace-nowrap md:col-span-1">
            <label htmlFor="inbox-filter" className="text-sm text-gray-700">Postfach:</label>
            <select
              id="inbox-filter"
              className="border rounded-md px-3 py-2"
              value={inboxFilter}
              onChange={(e) => setInboxFilter(e.target.value)}
            >
              {inboxFilterOptions.map(opt => (
                <option key={opt} value={opt}>
                  {opt === 'alle' ? 'Alle Postfächer' : opt}
                </option>
              ))}
            </select>
            <button
              onClick={exportToExcel}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
              title="Als Excel exportieren"
            >
              <ArrowDownTrayIcon className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>
      </div>



      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow p-6 animate-pulse h-24" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[
              {
                id: 1,
                name: 'E-Mails im Zeitraum',
                value: totalInRange.toString(),
                icon: EnvelopeIcon,
                color: 'bg-blue-100 text-blue-600',
              },
              {
                id: 2,
                name: 'Kategorisiert',
                value: categorizedCount.toString(),
                icon: TagIcon,
                color: 'bg-green-100 text-green-600',
              },
              {
                id: 3,
                name: 'Nicht kategorisierbar',
                value: unrecognizableCount.toString(),
                icon: ExclamationCircleIcon,
                color: 'bg-red-100 text-red-600',
              },
              // {
              //   id: 4,
              //   name: 'Kundennummer fehlend',
              //   value: missingCustomerNumberCount.toString(),
              //   icon: ExclamationCircleIcon,
              //   color: 'bg-orange-100 text-orange-600',
              // },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.id} className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center">
                    <div className={`rounded-full p-3 mr-4 ${stat.color}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-gray-500 text-sm">{stat.name}</p>
                      <h2 className="text-2xl font-bold">{stat.value}</h2>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Last N days chart (basierend auf gewähltem Zeitraum) + category filter */}
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-3">
              <h2 className="text-xl font-semibold">
                Eingänge – {range.start && range.end ? `${range.start} bis ${range.end}` : 'Zeitraum'}
              </h2>

              {/* Category filter pills */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-gray-600 mr-1">Kategorien:</span>
                <button
                  onClick={selectAllChartCategories}
                  className="px-2 py-1 text-xs rounded-md border bg-gray-50 hover:bg-gray-100"
                >
                  Alle
                </button>
                {categoriesWithOther.map((name) => {
                  const checked = chartCategoryFilter.includes(name);
                  return (
                    <label
                      key={name}
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border cursor-pointer ${
                        checked
                          ? 'bg-blue-100 border-blue-300 text-blue-800'
                          : 'bg-gray-100 border-gray-300 text-gray-700'
                      }`}
                      title={name}
                    >
                      <input
                        type="checkbox"
                        className="mr-1 accent-blue-600"
                        checked={checked}
                        onChange={() => toggleChartCategory(name)}
                      />
                      {name}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="h-64">
              <Bar data={barData} options={barOptions} />
            </div>
          </div>

          {/* Category distribution */}
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4">Verteilung nach Kategorien</h2>

            {categoryBuckets.length === 0 ? (
              <p className="text-gray-500">Keine Kategorien vorhanden.</p>
            ) : (
              <div className="space-y-4">
                {categoryBuckets.map((category) => (
                  <div key={category.name} className="flex items-center">
                    <span className="text-gray-700 w-64 truncate" title={category.name}>
                      {category.name}
                    </span>
                    <div className="flex-1 bg-gray-200 rounded-full h-4">
                      <div
                        className="bg-primary rounded-full h-4"
                        style={{ width: `${(category.count / maxCategoryCount) * 100}%` }}
                      />
                    </div>
                    <span className="ml-4 text-gray-700">{category.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
