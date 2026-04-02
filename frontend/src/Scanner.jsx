import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LineChart, Line, Tooltip, ResponsiveContainer } from 'recharts';
import TICKER_DATA from './tickerData';
import './Scanner.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

// Core tickers (always scanned, appear above the divider)
const CORE_TICKERS = new Set([
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'NFLX',
  'AMD', 'INTC', 'AVGO', 'QCOM', 'TSM', 'MU',
  'V', 'MA', 'PYPL', 'COIN', 'HOOD',
  'JPM', 'BAC', 'GS',
  'JNJ', 'XOM', 'WMT',
]);

// ── Design tokens ──────────────────────────────────────────────────────────
const LEVEL_COLOR = {
  CRITICAL: '#ef4444',
  HIGH:     '#f59e0b',
  MEDIUM:   '#6366f1',
  LOW:      '#334155',
};

const MOVER_COLOR = {
  BREAKOUT: '#22c55e',
  WATCH:    '#f59e0b',
  NEUTRAL:  '#475569',
};

const SORT_LABELS = {
  alert_score:  { label: 'Signal', title: '' },
  mover_score:  { label: 'Mover',  title: '' },
  price_change: { label: 'Price',  title: '' },
  hype_score:   { label: 'Hype',   title: 'Sorted by Reddit/social mention Z-score' },
};

// ── Helpers ────────────────────────────────────────────────────────────────
function getDirectionSignal(alert) {
  let score = 0;
  const cpRatio = alert.options_call_put_ratio || 0;
  const callVol = alert.options_total_call_volume || 0;
  const putVol  = alert.options_total_put_volume  || 0;
  const pricePct = alert.price_change_pct || 0;
  const sentiment = alert.sentiment_score || 0;
  const social   = alert.social_score || 0;

  if (cpRatio > 2.0) score += 2;
  else if (cpRatio > 0 && cpRatio < 0.7) score -= 2;
  if (callVol > putVol * 1.5) score += 1;
  else if (putVol > callVol * 1.5) score -= 1;
  if (pricePct > 1.5) score += 1;
  else if (pricePct < -1.5) score -= 1;
  if (sentiment > 0.3) score += 0.5;
  else if (sentiment < -0.3) score -= 0.5;
  if (social >= 5) { if (pricePct > 0) score += 0.5; else if (pricePct < 0) score -= 0.5; }

  return score > 1.5 ? 'BULLISH' : score < -1.5 ? 'BEARISH' : 'NEUTRAL';
}

function formatAge(ts) {
  if (!ts) return null;
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function fmt(value, decimals = 2, showZero = false) {
  if (value === undefined || value === null) return '—';
  if (value === 0) return showZero ? '0' : '—';
  if (Number.isInteger(value) || decimals === 0) return value.toLocaleString();
  return Number(value).toFixed(decimals);
}

// ── Left panel: single ticker row ─────────────────────────────────────────
const TickerRow = React.memo(({ data, selected, onClick, rowRef, sortBy }) => {
  const score    = data.alert_score || data.early_warning_score || 0;
  const pct      = data.price_change_pct || 0;
  const name     = TICKER_DATA[data.ticker]?.name || '';
  const barW     = Math.min(score / 10, 1) * 40;
  const barColor = data.alert_level === 'LOW' ? '#1a2740' : LEVEL_COLOR[data.alert_level];
  const showHype = sortBy === 'hype_score';

  return (
    <div
      ref={rowRef}
      className={`sc-row${selected ? ' sc-row--selected' : ''}`}
      onClick={onClick}
      tabIndex={0}
      role="option"
      aria-selected={selected}
      onKeyDown={e => e.key === 'Enter' && onClick()}
    >
      <div
        className="sc-row-bar"
        style={{ background: data.alert_level === 'LOW' ? 'transparent' : LEVEL_COLOR[data.alert_level] }}
      />
      <span className="sc-row-ticker">{data.ticker}</span>
      <span className="sc-row-name">{name}</span>
      {showHype ? (
        <span className="sc-row-hype">
          {data.hype_score != null ? data.hype_score.toFixed(2) : '—'}
        </span>
      ) : (
        <div className="sc-row-mini-track">
          <div className="sc-row-mini-fill" style={{ width: barW, background: barColor }} />
        </div>
      )}
      <span className="sc-row-score">{score.toFixed(1)}</span>
      <span className={`sc-row-pct sc-pct-${pct > 0 ? 'up' : pct < 0 ? 'dn' : 'flat'}`}>
        {pct > 0 ? '↑' : pct < 0 ? '↓' : ''}{Math.abs(pct).toFixed(2)}%
      </span>
    </div>
  );
});

// ── Right panel: signal row ────────────────────────────────────────────────
const SignalRow = ({ label, score, fillColor, detail }) => (
  <div className="sc-signal-row">
    <span className="sc-signal-label">{label}</span>
    <div className="sc-signal-track">
      <div
        className="sc-signal-fill"
        style={{ width: `${Math.min(score / 10, 1) * 100}%`, background: fillColor }}
      />
    </div>
    <span className="sc-signal-score">{score}/10</span>
    <span className="sc-signal-detail">{detail}</span>
  </div>
);

// ── Right panel: stat block (for mover/sentiment sections) ─────────────────
const StatBlock = ({ label, value, sub }) => (
  <div className="sc-stat-block">
    <div className="sc-stat-value">{value}</div>
    {sub && <div className="sc-stat-sub">{sub}</div>}
    <div className="sc-stat-key">{label}</div>
  </div>
);

// ── Empty state ────────────────────────────────────────────────────────────
const EmptyState = () => (
  <div className="sc-empty">
    <div className="sc-empty-mark">◈</div>
    <p className="sc-empty-text">Select a ticker to view analysis</p>
  </div>
);

// ── Main component ─────────────────────────────────────────────────────────
const Scanner = ({ polymarketEvents = [], onTickerClick }) => {
  const [tickers, setTickers]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [sortBy, setSortBy]           = useState('alert_score');
  const [showLow, setShowLow]         = useState(false);
  const [lastScanned, setLastScanned] = useState(null);
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [historyData, setHistoryData]       = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [watchlist, setWatchlist] = useState(() => {
    try { return JSON.parse(localStorage.getItem('foega_watchlist')) || []; }
    catch { return []; }
  });
  const [isMobile, setIsMobile]               = useState(window.innerWidth < 768);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const rowRefs = useRef({});
  const listRef = useRef(null);

  // ── Responsive ──
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // ── Data fetch ──
  useEffect(() => {
    const load = async () => {
      try {
        const [alertsRes, moversRes, hypeRes] = await Promise.all([
          fetch(`${API_BASE_URL}/alerts/cached`),
          fetch(`${API_BASE_URL}/movers/cached`),
          fetch(`${API_BASE_URL}/trending/cached_hype`),
        ]);
        const [alerts, movers, hype] = await Promise.all([
          alertsRes.json(), moversRes.json(), hypeRes.json(),
        ]);

        const map = {};
        if (Array.isArray(alerts)) {
          alerts.forEach(a => { map[a.ticker] = { ...a }; });
          const ts = alerts.map(a => a.updated_at).filter(Boolean).sort().reverse();
          if (ts.length) setLastScanned(new Date(ts[0]));
        }
        if (Array.isArray(movers)) {
          movers.forEach(m => {
            if (!map[m.ticker]) map[m.ticker] = { ticker: m.ticker };
            Object.assign(map[m.ticker], {
              mover_score:       m.mover_score,
              mover_label:       m.label,
              momentum_pct:      m.momentum_pct,
              near_52w_high:     m.near_52w_high,
              near_round_number: m.near_round_number,
            });
          });
        }
        if (Array.isArray(hype)) {
          hype.forEach(h => {
            if (!map[h.ticker]) map[h.ticker] = { ticker: h.ticker };
            map[h.ticker].hype_score = h.hype_score;
          });
        }
        setTickers(Object.values(map));
      } catch (err) {
        console.error('Scanner fetch error:', err);
      }
      setLoading(false);
    };
    load();
  }, []);

  const fetchHistory = useCallback(async (ticker) => {
    setHistoryLoading(true);
    setHistoryData([]);
    try {
      const res  = await fetch(`${API_BASE_URL}/history/${ticker}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setHistoryData(data.map(d => ({
          date:  new Date(d.recorded_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          score: d.early_warning_score,
        })));
      }
    } catch (err) {
      console.error('History fetch error:', err);
    }
    setHistoryLoading(false);
  }, []);

  const toggleWatch = useCallback((ticker) => {
    setWatchlist(prev => {
      const next = prev.includes(ticker) ? prev.filter(t => t !== ticker) : [...prev, ticker];
      localStorage.setItem('foega_watchlist', JSON.stringify(next));
      return next;
    });
  }, []);

  // ── Sort + filter ──
  // Strip zero-data stale rows (belt-and-suspenders against Supabase ghost rows)
  const nonZero = tickers.filter(
    t => !(t.alert_score === 0 && t.price_change_pct === 0 && t.current_price === 0)
  );
  const filtered = showLow ? nonZero : nonZero.filter(t => t.alert_level !== 'LOW');
  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'mover_score':   return (b.mover_score || 0) - (a.mover_score || 0);
      case 'price_change':  return Math.abs(b.price_change_pct || 0) - Math.abs(a.price_change_pct || 0);
      case 'hype_score':    return (b.hype_score || 0) - (a.hype_score || 0);
      default:              return (b.alert_score || b.early_warning_score || 0) - (a.alert_score || a.early_warning_score || 0);
    }
  });

  const selectedData = tickers.find(t => t.ticker === selectedTicker) || null;

  const handleSelect = useCallback((item) => {
    setSelectedTicker(item.ticker);
    fetchHistory(item.ticker);
    if (window.innerWidth < 768) setMobileDrawerOpen(true);
  }, [fetchHistory]);

  // ── Keyboard navigation ──
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const idx  = sorted.findIndex(t => t.ticker === selectedTicker);
      const next = e.key === 'ArrowDown'
        ? Math.min(idx + 1, sorted.length - 1)
        : Math.max(idx - 1, 0);
      if (next !== idx && sorted[next]) {
        handleSelect(sorted[next]);
        rowRefs.current[sorted[next].ticker]?.scrollIntoView({ block: 'nearest' });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sorted, selectedTicker, handleSelect]);

  // ── Alert counts ──
  const counts = {
    CRITICAL: tickers.filter(t => t.alert_level === 'CRITICAL').length,
    HIGH:     tickers.filter(t => t.alert_level === 'HIGH').length,
    MEDIUM:   tickers.filter(t => t.alert_level === 'MEDIUM').length,
    LOW:      tickers.filter(t => t.alert_level === 'LOW').length,
  };

  // ── Loading state ──
  if (loading) {
    return (
      <div className="sc-scanner">
        <div className="sc-left">
          <div className="sc-left-header">
            <span className="sc-header-label">SCANNER</span>
          </div>
          <div className="sc-loading-list">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="sc-row-skeleton" style={{ opacity: 1 - i * 0.06 }} />
            ))}
          </div>
        </div>
        <div className="sc-divider" />
        <div className="sc-right sc-right--empty">
          <EmptyState />
        </div>
      </div>
    );
  }

  // ── Detail panel content ──────────────────────────────────────────────────
  const renderDetail = () => {
    if (!selectedData) return <EmptyState />;
    const d = selectedData;
    const levelColor = LEVEL_COLOR[d.alert_level] || '#334155';
    const score      = d.alert_score || d.early_warning_score || 0;
    const pct        = d.price_change_pct || 0;
    const direction  = getDirectionSignal(d);
    const isWatched  = watchlist.includes(d.ticker);
    const tdInfo     = TICKER_DATA[d.ticker];

    const odds = polymarketEvents.find(e => e.affected_tickers?.includes(d.ticker));
    const earningsTag = (() => {
      if (!d.earnings_date) return null;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const earDate = new Date(d.earnings_date + 'T00:00:00');
      const diff = Math.round((earDate - today) / 86400000);
      if (diff < 0 || diff > 14) return null;
      const tl = d.earnings_time === 'bmo' ? ' BMO' : d.earnings_time === 'amc' ? ' AMC' : '';
      return diff === 0 ? `Earnings today${tl}` : `Earnings in ${diff}d${tl}`;
    })();

    return (
      <div className="sc-detail">

        {/* Section 1 — Header */}
        <div className="sc-detail-header">
          <div className="sc-detail-header-left">
            <h1 className="sc-detail-ticker">{d.ticker}</h1>
            <div className="sc-detail-meta">
              {tdInfo && <>{tdInfo.name}</>}
              {tdInfo && <span className="sc-meta-dot">·</span>}
              {tdInfo && <span>{tdInfo.sector}</span>}
              {tdInfo && <span className="sc-meta-dot">·</span>}
              {tdInfo && <span>{tdInfo.cap}</span>}
            </div>
          </div>
          <div className="sc-detail-header-right">
            <span className="sc-detail-score-num" style={{ color: levelColor }}>
              {score.toFixed(1)}
            </span>
            <span className="sc-detail-level-text" style={{ color: levelColor }}>
              {d.alert_level}
            </span>
          </div>
        </div>

        <div className="sc-section-divider" />

        {/* Section 2 — Price bar */}
        <div className="sc-price-bar">
          <span className="sc-price-value">
            {d.current_price ? `$${d.current_price.toFixed(2)}` : '--'}
          </span>
          {d.current_price && (
            <span className={`sc-price-change sc-pct-${pct > 0 ? 'up' : pct < 0 ? 'dn' : 'flat'}`}>
              {pct > 0 ? '↑' : pct < 0 ? '↓' : ''}{Math.abs(pct).toFixed(2)}%
            </span>
          )}
          <span className="sc-price-spacer" />
          <span className={`sc-direction-pill sc-dir-${direction.toLowerCase()}`}>
            {direction === 'BULLISH' ? '▲' : direction === 'BEARISH' ? '▼' : '▶'} {direction}
          </span>
          {odds && (
            <span className="sc-poly-pill">
              {odds.question.length > 22 ? odds.question.slice(0, 22) + '…' : odds.question}
              {' '}<strong>{Math.round(odds.probability * 100)}%</strong>
            </span>
          )}
          {earningsTag && (
            <span className="sc-earnings-pill">{earningsTag}</span>
          )}
        </div>

        <div className="sc-section-divider" />

        {/* Section 3 — Signals */}
        <div className="sc-signals">
          <SignalRow
            label="OPTIONS"
            score={d.options_score || 0}
            fillColor="#22c55e"
            detail={`C/P: ${fmt(d.options_call_put_ratio)}  Vol/OI: ${fmt(d.options_volume_oi_ratio)}`}
          />
          <SignalRow
            label="VOLUME"
            score={d.volume_score || 0}
            fillColor="#38bdf8"
            detail={`Today: ${fmt(d.volume_ratio_today)}x avg  5d: ${fmt(d.volume_ratio_5d)}x`}
          />
          <SignalRow
            label="SOCIAL"
            score={d.social_score ?? 0}
            fillColor="#f97316"
            detail={`Mentions: ${fmt(d.social_mentions, 0, true)}  Rank: #${fmt(d.social_rank, 0, true)}`}
          />
          <SignalRow
            label="INSIDER"
            score={d.insider_score || 0}
            fillColor="#a78bfa"
            detail={`Purchases (30d): ${d.insider_purchases_30d ?? 0}`}
          />
        </div>

        <div className="sc-section-divider" />

        {/* Section 4 — Predicted Mover */}
        <div className="sc-section-label">Predicted Mover</div>
        <div className="sc-stat-blocks">
          <StatBlock
            label="Mover Score"
            value={d.mover_score != null ? d.mover_score.toFixed(1) : '—'}
            sub={d.mover_label && (
              <span style={{ color: MOVER_COLOR[d.mover_label] || '#475569' }}>
                {d.mover_label}
              </span>
            )}
          />
          <StatBlock
            label="5-Day Momentum"
            value={
              d.momentum_pct != null
                ? <span style={{ color: d.momentum_pct >= 0 ? '#22c55e' : '#ef4444' }}>
                    {d.momentum_pct >= 0 ? '+' : ''}{d.momentum_pct.toFixed(2)}%
                  </span>
                : '—'
            }
          />
          <StatBlock
            label="Price Flags"
            value={
              d.near_52w_high || d.near_round_number
                ? <span className="sc-flag-group">
                    {d.near_52w_high     && <span className="sc-flag">Near 52w High</span>}
                    {d.near_round_number && <span className="sc-flag">Round Number</span>}
                  </span>
                : <span className="sc-flag-none">—</span>
            }
          />
        </div>

        <div className="sc-section-divider" />

        {/* Section 5 — Sentiment & News */}
        <div className="sc-section-label">Sentiment & News</div>
        <div className="sc-stat-blocks">
          <StatBlock
            label="Sentiment Score"
            value={(d.sentiment_score || 0).toFixed(3)}
            sub={
              <span style={{ color: (d.sentiment_score || 0) > 0.2 ? '#22c55e' : (d.sentiment_score || 0) < -0.2 ? '#ef4444' : '#64748b' }}>
                {(d.sentiment_score || 0) > 0.2 ? 'positive' : (d.sentiment_score || 0) < -0.2 ? 'negative' : 'neutral'}
              </span>
            }
          />
          <StatBlock
            label="News Articles (7d)"
            value={d.news_count ?? '—'}
          />
          {d.hype_score != null && (
            <StatBlock
              label="Hype Score"
              value={d.hype_score.toFixed(2)}
            />
          )}
        </div>

        <div className="sc-section-divider" />

        {/* Section 6 — 7-day sparkline */}
        <div className="sc-section-label">7-Day Score History</div>
        <div className="sc-sparkline">
          {historyLoading ? (
            <div className="sc-sparkline-placeholder">Loading…</div>
          ) : historyData.length < 2 ? (
            <div className="sc-sparkline-placeholder">Not enough history yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={80}>
              <LineChart data={historyData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <Tooltip
                  contentStyle={{ background: '#111d2e', border: '1px solid #1a2740', borderRadius: 4, fontSize: 11 }}
                  labelStyle={{ color: '#64748b' }}
                  itemStyle={{ color: levelColor }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke={levelColor}
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3, fill: levelColor, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="sc-section-divider" />

        {/* Section 7 — Actions */}
        <div className="sc-actions">
          <button
            className={`sc-watch-btn${isWatched ? ' sc-watch-btn--active' : ''}`}
            onClick={() => toggleWatch(d.ticker)}
          >
            {isWatched ? '✓ Watching' : '+ Add to Watchlist'}
          </button>
        </div>

      </div>
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="sc-scanner">

      {/* ══ Left panel ══ */}
      <div className="sc-left">

        {/* Header */}
        <div className="sc-left-header">
          <span className="sc-header-label">SCANNER</span>
          {lastScanned && (
            <span className="sc-header-ts">Updated {formatAge(lastScanned)}</span>
          )}
        </div>

        {/* Stats row */}
        <div className="sc-stats-row">
          <span><span style={{ color: '#ef4444' }}>{counts.CRITICAL}</span> critical</span>
          <span className="sc-stats-dot">·</span>
          <span><span style={{ color: '#f59e0b' }}>{counts.HIGH}</span> high</span>
          <span className="sc-stats-dot">·</span>
          <span><span style={{ color: '#6366f1' }}>{counts.MEDIUM}</span> medium</span>
          <span className="sc-stats-dot">·</span>
          <span><span style={{ color: '#475569' }}>{counts.LOW}</span> low</span>
        </div>

        {/* Controls */}
        <div className="sc-controls-row">
          <div className="sc-sort-pills" role="group" aria-label="Sort by">
            {Object.entries(SORT_LABELS).map(([key, { label, title }]) => (
              <button
                key={key}
                className={`sc-pill${sortBy === key ? ' sc-pill--active' : ''}`}
                onClick={() => setSortBy(key)}
                title={title || undefined}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            className={`sc-more-btn${showLow ? ' sc-more-btn--active' : ''}`}
            onClick={() => setShowLow(v => !v)}
            title={showLow ? 'Hide LOW alerts' : 'Show LOW alerts'}
            aria-pressed={showLow}
          >
            {showLow ? '✕' : '···'}
          </button>
        </div>

        {/* Ticker list */}
        <div className="sc-ticker-list" ref={listRef} role="listbox" aria-label="Tickers">
          {sorted.length === 0 ? (
            <div className="sc-list-empty">No alerts match current filters.</div>
          ) : (() => {
            const coreRows    = sorted.filter(t => CORE_TICKERS.has(t.ticker));
            const dynamicRows = sorted.filter(t => !CORE_TICKERS.has(t.ticker));
            return (
              <>
                {coreRows.map(item => (
                  <TickerRow
                    key={item.ticker}
                    data={item}
                    selected={selectedTicker === item.ticker}
                    onClick={() => handleSelect(item)}
                    rowRef={el => { rowRefs.current[item.ticker] = el; }}
                    sortBy={sortBy}
                  />
                ))}
                {dynamicRows.length > 0 && (
                  <>
                    <div className="sc-section-divider-row">
                      <span>TRENDING NOW</span>
                    </div>
                    {dynamicRows.map(item => (
                      <TickerRow
                        key={item.ticker}
                        data={item}
                        selected={selectedTicker === item.ticker}
                        onClick={() => handleSelect(item)}
                        rowRef={el => { rowRefs.current[item.ticker] = el; }}
                        sortBy={sortBy}
                      />
                    ))}
                  </>
                )}
              </>
            );
          })()}
        </div>

      </div>

      {/* Divider */}
      <div className="sc-divider" />

      {/* ══ Right panel (desktop) ══ */}
      {!isMobile && (
        <div className="sc-right">
          {renderDetail()}
        </div>
      )}

      {/* ══ Mobile drawer ══ */}
      {isMobile && mobileDrawerOpen && selectedData && (
        <div className="sc-mobile-backdrop" onClick={() => setMobileDrawerOpen(false)}>
          <div className="sc-mobile-drawer" onClick={e => e.stopPropagation()}>
            <div className="sc-mobile-drawer-handle">
              <button className="sc-drawer-close" onClick={() => setMobileDrawerOpen(false)}>✕</button>
            </div>
            <div className="sc-right">
              {renderDetail()}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Scanner;
