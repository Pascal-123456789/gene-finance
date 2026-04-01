import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { FaInfoCircle } from 'react-icons/fa';
import TICKER_DATA from './tickerData';
import './Scanner.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

// ── Heatmap sector layout ──────────────────────────────────────────────────
const SECTOR_MAP = {
  'Tech': [
    { ticker: 'AAPL', name: 'Apple' }, { ticker: 'MSFT', name: 'Microsoft' },
    { ticker: 'GOOGL', name: 'Alphabet' }, { ticker: 'AMZN', name: 'Amazon' },
    { ticker: 'META', name: 'Meta' }, { ticker: 'NVDA', name: 'Nvidia' },
    { ticker: 'TSLA', name: 'Tesla' }, { ticker: 'NFLX', name: 'Netflix' },
  ],
  'Semiconductors': [
    { ticker: 'AMD', name: 'AMD' }, { ticker: 'INTC', name: 'Intel' },
    { ticker: 'AVGO', name: 'Broadcom' }, { ticker: 'QCOM', name: 'Qualcomm' },
    { ticker: 'TSM', name: 'TSMC' }, { ticker: 'MU', name: 'Micron' },
  ],
  'Fintech': [
    { ticker: 'V', name: 'Visa' }, { ticker: 'MA', name: 'Mastercard' },
    { ticker: 'PYPL', name: 'PayPal' },
    { ticker: 'COIN', name: 'Coinbase' }, { ticker: 'HOOD', name: 'Robinhood' },
    { ticker: 'SOFI', name: 'SoFi' },
  ],
  'Meme & Social': [
    { ticker: 'GME', name: 'GameStop' }, { ticker: 'AMC', name: 'AMC' },
    { ticker: 'PLTR', name: 'Palantir' }, { ticker: 'SNAP', name: 'Snap' },
    { ticker: 'RBLX', name: 'Roblox' },
  ],
  'Growth': [
    { ticker: 'UBER', name: 'Uber' }, { ticker: 'LYFT', name: 'Lyft' },
    { ticker: 'DASH', name: 'DoorDash' }, { ticker: 'SPOT', name: 'Spotify' },
    { ticker: 'ZM', name: 'Zoom' },
  ],
  'Finance': [
    { ticker: 'JPM', name: 'JPMorgan' }, { ticker: 'BAC', name: 'BofA' },
    { ticker: 'GS', name: 'Goldman' }, { ticker: 'MS', name: 'Morgan Stanley' },
    { ticker: 'WFC', name: 'Wells Fargo' },
  ],
  'Healthcare': [
    { ticker: 'JNJ', name: 'J&J' }, { ticker: 'UNH', name: 'UnitedHealth' },
    { ticker: 'PFE', name: 'Pfizer' }, { ticker: 'ABBV', name: 'AbbVie' },
    { ticker: 'LLY', name: 'Eli Lilly' },
  ],
  'Energy': [
    { ticker: 'XOM', name: 'Exxon' }, { ticker: 'CVX', name: 'Chevron' },
    { ticker: 'COP', name: 'Conoco' }, { ticker: 'SLB', name: 'SLB' },
  ],
  'Consumer': [
    { ticker: 'WMT', name: 'Walmart' }, { ticker: 'HD', name: 'Home Depot' },
    { ticker: 'NKE', name: 'Nike' }, { ticker: 'MCD', name: "McDonald's" },
  ],
};

// ── Helpers ────────────────────────────────────────────────────────────────
function getDirectionSignal(alert) {
  let score = 0;
  const cpRatio = alert.options_call_put_ratio || 0;
  const callVol = alert.options_total_call_volume || 0;
  const putVol = alert.options_total_put_volume || 0;
  const pricePct = alert.price_change_pct || 0;
  const sentiment = alert.sentiment_score || 0;
  const social = alert.social_score || 0;

  if (cpRatio > 2.0) score += 2;
  else if (cpRatio > 0 && cpRatio < 0.7) score -= 2;
  if (callVol > putVol * 1.5) score += 1;
  else if (putVol > callVol * 1.5) score -= 1;
  if (pricePct > 1.5) score += 1;
  else if (pricePct < -1.5) score -= 1;
  if (sentiment > 0.3) score += 0.5;
  else if (sentiment < -0.3) score -= 0.5;
  if (social >= 5) { if (pricePct > 0) score += 0.5; else if (pricePct < 0) score -= 0.5; }

  const direction = score > 1.5 ? 'BULLISH' : score < -1.5 ? 'BEARISH' : 'NEUTRAL';
  return { direction };
}

function formatAge(ts) {
  if (!ts) return null;
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins !== 1 ? 's' : ''} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`;
  return `${Math.round(hrs / 24)} day${Math.round(hrs / 24) !== 1 ? 's' : ''} ago`;
}

function formatDetail(value, decimals = 2, showZero = false) {
  if (value === undefined || value === null) return '—';
  if (value === 0) return showZero ? '0' : '—';
  if (Number.isInteger(value) || decimals === 0) return value.toLocaleString();
  return Number(value).toFixed(decimals);
}

function getSentimentEmoji(score) {
  if (score > 0.5) return '😊';
  if (score > 0.2) return '🙂';
  if (score > -0.2) return '😐';
  if (score > -0.5) return '😟';
  return '😢';
}

function getAlertCardClass(level) {
  const map = { CRITICAL: 'alert-critical', HIGH: 'alert-high', MEDIUM: 'alert-medium' };
  return `sc-alert-card ${map[level] || 'alert-low'}`;
}

function getAlertEmoji(level) {
  return { CRITICAL: '🚨', HIGH: '⚠️', MEDIUM: '⚡' }[level] || '📊';
}

function getPriceChangeClass(change) {
  if (change > 2) return 'price-up-strong';
  if (change > 0) return 'price-up';
  if (change < -2) return 'price-down-strong';
  if (change < 0) return 'price-down';
  return 'price-neutral';
}

function getMoverLabelClass(label) {
  return { BREAKOUT: 'sc-mover-breakout', WATCH: 'sc-mover-watch' }[label] || 'sc-mover-neutral';
}

// Heatmap helpers
function getSignalColor(moverScore) {
  const clamped = Math.max(0, Math.min(10, moverScore || 0));
  const t = clamped / 10;
  return `hsl(160, ${Math.round(t * 65)}%, ${16 + Math.round(t * 12)}%)`;
}

function getHeatmapBorder(alertLevel) {
  switch (alertLevel) {
    case 'CRITICAL': return '2px solid #ff3333';
    case 'HIGH': return '2px solid #ff9900';
    case 'MEDIUM': return '1px solid rgba(255, 255, 255, 0.15)';
    default: return '1px solid rgba(255, 255, 255, 0.06)';
  }
}

function getHeatmapAlertClass(alertLevel) {
  switch (alertLevel) {
    case 'CRITICAL': return 'hm-alert-critical';
    case 'HIGH': return 'hm-alert-high';
    default: return '';
  }
}

// Secondary label for heatmap tile based on current sort
function getTileSecondaryLabel(d, sortBy) {
  switch (sortBy) {
    case 'mover_score':
      return d.mover_label
        ? `${(d.mover_score || 0).toFixed(1)} ${d.mover_label}`
        : `${(d.mover_score || 0).toFixed(1)}`;
    case 'price_change':
      return `${(d.price_change_pct || 0) >= 0 ? '+' : ''}${(d.price_change_pct || 0).toFixed(2)}%`;
    case 'hype_score':
      return `Hype ${(d.hype_score || 0).toFixed(2)}`;
    default:
      return `Score ${(d.alert_score || d.early_warning_score || 0).toFixed(1)}`;
  }
}

// ── Component ──────────────────────────────────────────────────────────────
const Scanner = ({ polymarketEvents = [], onTickerClick }) => {
  const [tickers, setTickers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('cards');
  const [sortBy, setSortBy] = useState('alert_score');
  const [showLow, setShowLow] = useState(false);
  const [lastScanned, setLastScanned] = useState(null);

  // Cards-view state
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedTicker, setExpandedTicker] = useState(null);
  const [watchlist, setWatchlist] = useState(() => {
    try { return JSON.parse(localStorage.getItem('foega_watchlist')) || []; }
    catch { return []; }
  });

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
              mover_score: m.mover_score,
              mover_label: m.label,
              momentum_pct: m.momentum_pct,
              near_52w_high: m.near_52w_high,
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

  const fetchHistory = async (ticker) => {
    setHistoryLoading(true);
    setHistoryData([]);
    try {
      const res = await fetch(`${API_BASE_URL}/history/${ticker}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setHistoryData(data.map(d => ({
          date: new Date(d.recorded_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          score: d.early_warning_score,
        })));
      }
    } catch (err) {
      console.error('History fetch error:', err);
    }
    setHistoryLoading(false);
  };

  const toggleWatch = (ticker) => {
    const updated = watchlist.includes(ticker)
      ? watchlist.filter(t => t !== ticker)
      : [...watchlist, ticker];
    setWatchlist(updated);
    localStorage.setItem('foega_watchlist', JSON.stringify(updated));
  };

  const getPolymarketOdds = (ticker) =>
    polymarketEvents.find(e => e.affected_tickers?.includes(ticker)) || null;

  // ── Sort & filter ──
  const filtered = showLow ? tickers : tickers.filter(t => t.alert_level !== 'LOW');
  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'mover_score':   return (b.mover_score || 0) - (a.mover_score || 0);
      case 'price_change':  return Math.abs(b.price_change_pct || 0) - Math.abs(a.price_change_pct || 0);
      case 'hype_score':    return (b.hype_score || 0) - (a.hype_score || 0);
      default:              return (b.alert_score || b.early_warning_score || 0) - (a.alert_score || a.early_warning_score || 0);
    }
  });

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="content-area sc-scanner">
        <div className="sc-header">
          <h1 className="sc-title">📊 Scanner</h1>
        </div>
        <div className="sc-skeleton-grid">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="skeleton-card">
              <div className="skeleton-line title" />
              <div className="skeleton-line score" />
              <div className="skeleton-line badge" />
              <div className="skeleton-line bar" />
              <div className="skeleton-line bar" />
              <div className="skeleton-line bar" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Controls bar (shared between views) ──
  const controlsBar = (
    <div className="sc-controls">
      {/* View toggle */}
      <div className="sc-view-toggle">
        <button
          className={`sc-toggle-btn ${viewMode === 'cards' ? 'active' : ''}`}
          onClick={() => setViewMode('cards')}
        >
          Cards
        </button>
        <button
          className={`sc-toggle-btn ${viewMode === 'heatmap' ? 'active' : ''}`}
          onClick={() => setViewMode('heatmap')}
        >
          Heatmap
        </button>
      </div>

      {/* Sort */}
      <div className="sc-sort">
        <label>Sort by:</label>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="alert_score">Early Warning</option>
          <option value="mover_score">Predicted Mover</option>
          <option value="price_change">Price Change</option>
          <option value="hype_score">Hype Score</option>
        </select>
      </div>

      {/* Show LOW toggle */}
      <button
        className={`sc-show-low-btn ${showLow ? 'active' : ''}`}
        onClick={() => setShowLow(v => !v)}
      >
        {showLow ? 'Showing All' : 'Show LOW'}
      </button>
    </div>
  );

  // ── Empty state ──
  if (tickers.length === 0) {
    return (
      <div className="content-area sc-scanner">
        <div className="sc-header">
          <h1 className="sc-title">📊 Scanner</h1>
        </div>
        {controlsBar}
        <div className="sc-empty">
          <h3>No data available</h3>
          <p>Trigger a scan via <code>/alerts/scan</code> or wait for the next hourly update.</p>
        </div>
      </div>
    );
  }

  // ── Alert summary stats ──
  const alertCounts = {
    CRITICAL: tickers.filter(t => t.alert_level === 'CRITICAL').length,
    HIGH: tickers.filter(t => t.alert_level === 'HIGH').length,
    MEDIUM: tickers.filter(t => t.alert_level === 'MEDIUM').length,
    LOW: tickers.filter(t => t.alert_level === 'LOW').length,
  };

  return (
    <div className="content-area sc-scanner">
      {/* ── Page header ── */}
      <div className="sc-header">
        <div>
          <h1 className="sc-title">📊 Scanner</h1>
          <p className="sc-tagline">Options flow · Volume · Social buzz · Predicted movers</p>
        </div>
        {lastScanned && (
          <span className="sc-last-scanned">Updated {formatAge(lastScanned)}</span>
        )}
      </div>

      {/* ── Alert summary counters ── */}
      <div className="sc-stat-row">
        <div className="sc-stat critical"><span className="sc-stat-n">{alertCounts.CRITICAL}</span><span className="sc-stat-l">Critical</span></div>
        <div className="sc-stat high"><span className="sc-stat-n">{alertCounts.HIGH}</span><span className="sc-stat-l">High</span></div>
        <div className="sc-stat medium"><span className="sc-stat-n">{alertCounts.MEDIUM}</span><span className="sc-stat-l">Medium</span></div>
        <div className="sc-stat low"><span className="sc-stat-n">{alertCounts.LOW}</span><span className="sc-stat-l">Monitored</span></div>
      </div>

      {/* ── Sticky controls ── */}
      {controlsBar}

      {/* ════════════════════════════════════════════
          CARDS VIEW
      ════════════════════════════════════════════ */}
      {viewMode === 'cards' && (
        <div className="sc-card-grid">
          {sorted.map((alert, index) => {
            const { direction } = getDirectionSignal(alert);
            const dirCfg = {
              BULLISH: { arrow: '▲', cls: 'bullish' },
              BEARISH: { arrow: '▼', cls: 'bearish' },
              NEUTRAL: { arrow: '▶', cls: 'neutral' },
            }[direction];
            const odds = getPolymarketOdds(alert.ticker);
            const isExpanded = expandedTicker === alert.ticker;

            return (
              <div
                key={alert.ticker || index}
                className={getAlertCardClass(alert.alert_level)}
                onClick={() => { setSelectedAlert(alert); fetchHistory(alert.ticker); }}
              >
                {/* Header */}
                <div className="alert-header">
                  <div className="alert-header-left">
                    <h2 className="alert-ticker">
                      {getAlertEmoji(alert.alert_level)} {alert.ticker}
                    </h2>
                    {TICKER_DATA[alert.ticker] && (
                      <span className="alert-company-name">{TICKER_DATA[alert.ticker].name}</span>
                    )}
                  </div>
                  <span className="alert-score" title="Weighted score: 40% options + 35% volume + 25% social">
                    {(alert.alert_score || alert.early_warning_score || 0).toFixed(1)}
                    <FaInfoCircle className="score-info-icon" />
                  </span>
                </div>

                {/* Sector / cap */}
                {TICKER_DATA[alert.ticker] && (
                  <div className="alert-meta-row">
                    <span className="alert-sector-label">{TICKER_DATA[alert.ticker].sector}</span>
                    <span className={`alert-cap-badge cap-${TICKER_DATA[alert.ticker].cap.split(' ')[0].toLowerCase()}`}>
                      {TICKER_DATA[alert.ticker].cap}
                    </span>
                  </div>
                )}

                {/* Price */}
                <div className="price-info">
                  <span className="current-price">
                    {alert.current_price ? `$${alert.current_price.toFixed(2)}` : '--'}
                  </span>
                  <span className={`price-change ${getPriceChangeClass(alert.price_change_pct || 0)}`}>
                    {alert.current_price
                      ? `${(alert.price_change_pct || 0) > 0 ? '+' : ''}${(alert.price_change_pct || 0).toFixed(2)}%`
                      : '--'}
                  </span>
                </div>

                {/* Alert level badge + direction badge */}
                <div className="alert-level-badge">{alert.alert_level}</div>

                <div className={`direction-badge ${dirCfg.cls}`}>
                  <span className="direction-arrow">{dirCfg.arrow}</span>
                  <span className="direction-label">{direction}</span>
                </div>

                {/* Polymarket badge */}
                {odds && (
                  <div className="market-odds-badge">
                    <span className="odds-label">{odds.question.length > 25 ? odds.question.slice(0, 25) + '…' : odds.question}</span>
                    <span className="odds-value">{Math.round(odds.probability * 100)}%</span>
                  </div>
                )}

                {/* Earnings badge */}
                {alert.earnings_date && (() => {
                  const today = new Date(); today.setHours(0, 0, 0, 0);
                  const earningsDate = new Date(alert.earnings_date + 'T00:00:00');
                  const diffDays = Math.round((earningsDate - today) / 86400000);
                  if (diffDays < 0 || diffDays > 14) return null;
                  const timeLabel = alert.earnings_time === 'bmo' ? ' BMO' : alert.earnings_time === 'amc' ? ' AMC' : '';
                  return (
                    <div className="earnings-badge">
                      <span className="earnings-icon">📊</span>
                      <span className="earnings-text">
                        {diffDays === 0 ? 'Earnings today' : `Earnings in ${diffDays}d`}{timeLabel}
                      </span>
                    </div>
                  );
                })()}

                {/* Signal bars */}
                <div className="unified-signals">
                  <div className="signal-row" title="Unusual call option buying vs puts — high = institutions betting on a move">
                    <span className="signal-label">Options</span>
                    <span className="signal-bar"><div className="signal-fill" style={{ width: `${(alert.options_score || 0) * 10}%` }} /></span>
                    <span className="signal-value">{alert.options_score || 0}/10</span>
                  </div>
                  <div className="signal-row" title="Today's trading volume vs 30-day average — high = unusual activity">
                    <span className="signal-label">Volume</span>
                    <span className="signal-bar"><div className="signal-fill volume" style={{ width: `${(alert.volume_score || 0) * 10}%` }} /></span>
                    <span className="signal-value">{alert.volume_score || 0}/10</span>
                  </div>
                  <div className="signal-row" title="Reddit/WSB mentions via ApeWisdom. Only tickers in Reddit's top 100 most-discussed receive a score — 0 means not currently trending.">
                    <span className="signal-label">Social</span>
                    <span className="signal-bar"><div className="signal-fill social" style={{ width: `${(alert.social_score ?? 0) * 10}%` }} /></span>
                    <span className="signal-value">{alert.social_score ?? 0}/10</span>
                  </div>
                  <div className="signal-row" title="SEC Form 4 insider purchases in last 30 days — high = executives buying their own stock">
                    <span className="signal-label">Insider</span>
                    <span className="signal-bar"><div className="signal-fill insider" style={{ width: `${(alert.insider_score || 0) * 10}%` }} /></span>
                    <span className="signal-value">{alert.insider_score || 0}/10</span>
                  </div>
                </div>

                {/* Signals fired summary */}
                <div className="signals-triggered">
                  {(() => {
                    const firing = [
                      (alert.options_score || 0) >= 3,
                      (alert.volume_score || 0) >= 3,
                      (alert.social_score || 0) >= 3,
                    ].filter(Boolean).length;
                    if (firing === 0) return 'No unusual activity';
                    if (firing === 3) return 'All signals firing';
                    return `${firing} signal${firing > 1 ? 's' : ''} firing`;
                  })()}
                </div>

                {/* View Details toggle */}
                <button
                  className="details-toggle-btn"
                  onClick={e => { e.stopPropagation(); setExpandedTicker(isExpanded ? null : alert.ticker); }}
                >
                  {isExpanded ? 'Hide Details' : 'View Details'}
                </button>

                {/* Expandable details */}
                <div className={`signal-details ${isExpanded ? 'expanded' : ''}`}>
                  <div className="detail-section">
                    <h4>Options Flow</h4>
                    <div className="detail-grid">
                      <span className="detail-key">Call/Put Ratio</span>
                      <span className="detail-val">{formatDetail(alert.options_call_put_ratio)}</span>
                      <span className="detail-key">Vol/OI Ratio</span>
                      <span className="detail-val">{formatDetail(alert.options_volume_oi_ratio)}</span>
                      <span className="detail-key">Total Call Vol</span>
                      <span className="detail-val">{formatDetail(alert.options_total_call_volume, 0)}</span>
                      <span className="detail-key">Total Put Vol</span>
                      <span className="detail-val">{formatDetail(alert.options_total_put_volume, 0)}</span>
                    </div>
                  </div>
                  <div className="detail-section">
                    <h4>Volume</h4>
                    <div className="detail-grid">
                      <span className="detail-key">Today</span>
                      <span className="detail-val">{formatDetail(alert.volume_today, 0)}</span>
                      <span className="detail-key">30d Avg</span>
                      <span className="detail-val">{formatDetail(alert.volume_avg_30d, 0)}</span>
                      <span className="detail-key">Vol Ratio</span>
                      <span className="detail-val">{formatDetail(alert.volume_ratio_today)}x</span>
                      <span className="detail-key">5d Ratio</span>
                      <span className="detail-val">{formatDetail(alert.volume_ratio_5d)}x</span>
                      <span className="detail-key">Volatility Ratio</span>
                      <span className="detail-val">{formatDetail(alert.volume_volatility_ratio)}</span>
                    </div>
                  </div>
                  <div className="detail-section">
                    <h4>Social</h4>
                    <div className="detail-grid">
                      <span className="detail-key">Mentions</span>
                      <span className="detail-val">{formatDetail(alert.social_mentions, 0, true)}</span>
                      <span className="detail-key">Rank</span>
                      <span className="detail-val">{formatDetail(alert.social_rank, 0, true)}</span>
                      <span className="detail-key">Upvotes</span>
                      <span className="detail-val">{formatDetail(alert.social_upvotes, 0, true)}</span>
                    </div>
                  </div>
                  <div className="detail-section">
                    <h4>Insider Buying</h4>
                    <div className="detail-grid">
                      <span className="detail-key">Score</span>
                      <span className="detail-val">{alert.insider_score ?? 0}/10</span>
                      <span className="detail-key">Purchases (30d)</span>
                      <span className="detail-val">{formatDetail(alert.insider_purchases_30d, 0, true)}</span>
                    </div>
                  </div>
                  {/* Predicted Mover data */}
                  <div className="detail-section">
                    <h4>Predicted Mover</h4>
                    <div className="detail-grid">
                      <span className="detail-key">Mover Score</span>
                      <span className="detail-val">
                        {alert.mover_score != null ? alert.mover_score.toFixed(1) : '—'}
                        {alert.mover_label && (
                          <span className={`sc-mover-label-inline ${getMoverLabelClass(alert.mover_label)}`}>
                            {alert.mover_label}
                          </span>
                        )}
                      </span>
                      <span className="detail-key">5d Momentum</span>
                      <span className={`detail-val ${alert.momentum_pct >= 0 ? 'momentum-up' : 'momentum-down'}`}>
                        {alert.momentum_pct != null
                          ? `${alert.momentum_pct >= 0 ? '+' : ''}${alert.momentum_pct.toFixed(2)}%`
                          : '—'}
                      </span>
                      <span className="detail-key">Hype Score</span>
                      <span className="detail-val">{alert.hype_score != null ? alert.hype_score.toFixed(2) : '—'}</span>
                    </div>
                    {(alert.near_52w_high || alert.near_round_number) && (
                      <div className="sc-mover-flags">
                        {alert.near_52w_high && <span className="sc-flag">🏔 Near 52w High</span>}
                        {alert.near_round_number && <span className="sc-flag">🎯 Round Number</span>}
                      </div>
                    )}
                  </div>
                </div>

                {/* Watch button */}
                <button
                  className={`watch-btn ${watchlist.includes(alert.ticker) ? 'watched' : ''}`}
                  onClick={e => { e.stopPropagation(); toggleWatch(alert.ticker); }}
                >
                  {watchlist.includes(alert.ticker) ? 'Watching' : 'Watch'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ════════════════════════════════════════════
          HEATMAP VIEW
      ════════════════════════════════════════════ */}
      {viewMode === 'heatmap' && (() => {
        const dataMap = {};
        tickers.forEach(t => { dataMap[t.ticker] = t; });

        return (
          <div className="sc-heatmap">
            <div className="sc-heatmap-legend">
              <div className="sc-legend-bar">
                <span className="sc-legend-label">Low signal</span>
                <div className="sc-legend-gradient" />
                <span className="sc-legend-label">High signal</span>
              </div>
              <div className="sc-legend-alerts">
                <span className="sc-legend-item sc-legend-critical">CRITICAL</span>
                <span className="sc-legend-item sc-legend-high">HIGH</span>
              </div>
            </div>

            <div className="sc-heatmap-sectors">
              {Object.entries(SECTOR_MAP).map(([sector, sectorTickers]) => {
                const present = sectorTickers.filter(t => dataMap[t.ticker]);
                if (present.length === 0) return null;
                return (
                  <div key={sector} className="sc-heatmap-sector">
                    <h2 className="sc-heatmap-sector-label">{sector}</h2>
                    <div className="sc-heatmap-grid">
                      {present.map(({ ticker, name }) => {
                        const d = dataMap[ticker] || {};
                        const moverScore = d.mover_score || 0;
                        const alertLevel = d.alert_level || 'LOW';
                        const pct = d.price_change_pct || 0;
                        const showFire = (d.options_score || 0) >= 6 || (d.volume_score || 0) >= 6;
                        const bgColor = getSignalColor(moverScore);
                        const border = getHeatmapBorder(alertLevel);
                        const alertClass = getHeatmapAlertClass(alertLevel);
                        const flex = Math.max(1, 1 + moverScore / 2);
                        const secondaryLabel = getTileSecondaryLabel(d, sortBy);

                        return (
                          <div
                            key={ticker}
                            className={`sc-heatmap-tile ${alertClass}`}
                            style={{ background: bgColor, flex, border }}
                            onClick={() => onTickerClick && onTickerClick(ticker)}
                          >
                            <div className="tile-top-row">
                              <span className="tile-ticker">{ticker}</span>
                              {showFire && <span className="tile-activity-icon" title="High options/volume activity">🔥</span>}
                            </div>
                            <span className="tile-name">{name}</span>
                            <span className={`tile-change ${pct >= 0 ? 'up' : 'down'}`}>
                              {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                            </span>
                            <span className="tile-secondary">{secondaryLabel}</span>
                            <div className="tile-tooltip">
                              <div><strong>{name}</strong> ({ticker})</div>
                              <div>Alert: {alertLevel}</div>
                              <div>Mover Score: {moverScore.toFixed(1)}{d.mover_label ? ` · ${d.mover_label}` : ''}</div>
                              <div>Options: {d.options_score || 0}/10</div>
                              <div>Volume: {d.volume_score || 0}/10</div>
                              <div>Social: {d.social_score || 0}/10</div>
                              <div>Price: {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</div>
                              {d.hype_score != null && <div>Hype: {d.hype_score.toFixed(2)}</div>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── Footer ── */}
      <footer className="dashboard-footer">
        Showing {sorted.length} of {tickers.length} stocks · Backend updates hourly
        {lastScanned && ` · Last scanned: ${formatAge(lastScanned)}`}
      </footer>

      {/* ── Detail modal ── */}
      {selectedAlert && (
        <div className="modal-overlay" onClick={() => setSelectedAlert(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedAlert(null)}>×</button>
            <h2>{selectedAlert.ticker} — Complete Analysis</h2>

            <div className="modal-section">
              <h3>📊 Overview</h3>
              <p>Alert Score: {(selectedAlert.alert_score || 0).toFixed(2)}/10</p>
              <p>Alert Level: <span className={`alert-level-${(selectedAlert.alert_level || 'LOW').toLowerCase()}`}>{selectedAlert.alert_level}</span></p>
              <p>Price: {selectedAlert.current_price
                ? <>{`$${selectedAlert.current_price.toFixed(2)}`}<span className={getPriceChangeClass(selectedAlert.price_change_pct || 0)}>{` (${(selectedAlert.price_change_pct || 0) > 0 ? '+' : ''}${(selectedAlert.price_change_pct || 0).toFixed(2)}%)`}</span></>
                : '--'}</p>
            </div>

            <div className="modal-section">
              <h3>📊 Options Activity</h3>
              <p>Score: {selectedAlert.options_score || 0}/10</p>
            </div>

            <div className="modal-section">
              <h3>📈 Volume Analysis</h3>
              <p>Score: {selectedAlert.volume_score || 0}/10</p>
            </div>

            <div className="modal-section">
              <h3>💬 Social Buzz (Reddit/WSB)</h3>
              <p>Score: {selectedAlert.social_score || 0}/10</p>
            </div>

            <div className="modal-section">
              <h3>🏛️ Insider Buying (SEC Form 4)</h3>
              <p>Score: {selectedAlert.insider_score || 0}/10</p>
              <p>Purchases (30d): {selectedAlert.insider_purchases_30d || 0}</p>
            </div>

            <div className="modal-section">
              <h3>💭 Sentiment & News</h3>
              <p>Sentiment: {(selectedAlert.sentiment_score || 0).toFixed(3)} {getSentimentEmoji(selectedAlert.sentiment_score || 0)}</p>
              <p>News Articles (7d): {selectedAlert.news_count || 0}</p>
            </div>

            {selectedAlert.mover_score != null && (
              <div className="modal-section">
                <h3>🚀 Predicted Mover</h3>
                <p>Mover Score: {selectedAlert.mover_score.toFixed(1)} — <span className={getMoverLabelClass(selectedAlert.mover_label)}>{selectedAlert.mover_label || 'NEUTRAL'}</span></p>
                {selectedAlert.momentum_pct != null && (
                  <p>5d Momentum: <span className={selectedAlert.momentum_pct >= 0 ? 'momentum-up' : 'momentum-down'}>
                    {selectedAlert.momentum_pct >= 0 ? '+' : ''}{selectedAlert.momentum_pct.toFixed(2)}%
                  </span></p>
                )}
                {selectedAlert.hype_score != null && <p>Hype Score: {selectedAlert.hype_score.toFixed(2)}</p>}
                {(selectedAlert.near_52w_high || selectedAlert.near_round_number) && (
                  <p>{selectedAlert.near_52w_high ? '🏔 Near 52-week high' : ''}{selectedAlert.near_52w_high && selectedAlert.near_round_number ? ' · ' : ''}{selectedAlert.near_round_number ? '🎯 Near round number' : ''}</p>
                )}
              </div>
            )}

            {(() => {
              const tickerEvents = polymarketEvents.filter(e => e.affected_tickers?.includes(selectedAlert.ticker));
              if (!tickerEvents.length) return null;
              return (
                <div className="modal-section">
                  <h3>🎯 Prediction Markets</h3>
                  {tickerEvents.map((evt, i) => (
                    <div key={i} className="polymarket-event">
                      <p className="polymarket-question">{evt.question}</p>
                      <div className="probability-bar-wrapper">
                        <div className="probability-bar">
                          <div className="probability-fill" style={{ width: `${Math.round(evt.probability * 100)}%` }} />
                        </div>
                        <span className="probability-label">{Math.round(evt.probability * 100)}%</span>
                      </div>
                      <div className="polymarket-meta">
                        <span>Vol: ${evt.volume_24h ? evt.volume_24h.toLocaleString() : '0'}</span>
                        {evt.end_date && <span>Ends: {new Date(evt.end_date).toLocaleDateString()}</span>}
                        {evt.slug && (
                          <a href={`https://polymarket.com/event/${evt.slug}`} target="_blank" rel="noopener noreferrer" className="polymarket-link" onClick={e => e.stopPropagation()}>
                            View on Polymarket
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            <div className="modal-section">
              <h3>📈 7-Day Score History</h3>
              {historyLoading ? (
                <p>Loading history...</p>
              ) : historyData.length < 2 ? (
                <p className="history-note">Not enough history yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={150}>
                  <LineChart data={historyData}>
                    <XAxis dataKey="date" tick={{ fill: '#aaa', fontSize: 11 }} />
                    <YAxis domain={[0, 10]} tick={{ fill: '#aaa', fontSize: 11 }} width={30} />
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #444', borderRadius: 6 }} labelStyle={{ color: '#aaa' }} itemStyle={{ color: '#22c55e' }} />
                    <Line type="monotone" dataKey="score" stroke="#22c55e" strokeWidth={2} dot={{ r: 3, fill: '#22c55e' }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="modal-footer">
              Signals: {selectedAlert.signals_triggered || 0}/3 active
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Scanner;
