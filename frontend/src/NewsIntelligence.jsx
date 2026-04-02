import React, { useState, useEffect } from 'react';
import './NewsIntelligence.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

// ── Config maps ────────────────────────────────────────────────────────────
const CONFLUENCE_TYPE = {
  CONFIRMED:        { label: 'CONFIRMED',        cls: 'conf-confirmed' },
  DIVERGENCE:       { label: 'DIVERGENCE',        cls: 'conf-divergence' },
  CATALYST_RISK:    { label: 'CATALYST RISK',     cls: 'conf-catalyst' },
  INSIDER_CATALYST: { label: 'INSIDER CATALYST',  cls: 'conf-insider' },
};

const FLAG_TYPE = {
  EARNINGS_RISK:    { cls: 'flag-amber' },
  UNUSUAL_ACTIVITY: { cls: 'flag-blue' },
  CONTRARIAN:       { cls: 'flag-red' },
  BREAKOUT_SETUP:   { cls: 'flag-green' },
  INSIDER_ALERT:    { cls: 'flag-purple' },
};

const FLOW_ARROW = { INTO: '▲', OUT_OF: '▼', NEUTRAL: '→' };
const FLOW_CLS   = { INTO: 'flow-into', OUT_OF: 'flow-out', NEUTRAL: 'flow-neutral' };
const DIR_ARROW  = { BULLISH: '▲', BEARISH: '▼', NEUTRAL: '→' };
const DIR_CLS    = { BULLISH: 'dir-bull', BEARISH: 'dir-bear', NEUTRAL: 'dir-neutral' };

const SENTIMENT_CLS = {
  BULLISH: 'sent-bull', BEARISH: 'sent-bear',
  MIXED: 'sent-mixed', NEUTRAL: 'sent-neutral',
};

function formatAge(ts) {
  if (!ts) return '';
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function formatArticleTs(unixSecs) {
  if (!unixSecs) return '';
  const mins = Math.round((Date.now() / 1000 - unixSecs) / 60);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

// Group confluences by detected_at — rows within 5 minutes of each other are one scan.
function groupByScan(confluences) {
  if (!confluences.length) return [];
  const sorted = [...confluences].sort(
    (a, b) => new Date(b.detected_at) - new Date(a.detected_at)
  );
  const groups = [];
  let current = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(current[0].detected_at).getTime();
    const curr = new Date(sorted[i].detected_at).getTime();
    if (Math.abs(prev - curr) <= 5 * 60 * 1000) {
      current.push(sorted[i]);
    } else {
      groups.push(current);
      current = [sorted[i]];
    }
  }
  groups.push(current);
  return groups; // array of arrays, each array is one scan batch
}

// ── Skeleton ───────────────────────────────────────────────────────────────
const LoadingSkeleton = () => (
  <div className="ni-page">
    <div className="ni-header">
      <span className="ni-title">NEWS RADAR</span>
    </div>
    <div className="ni-narrative-block">
      <div className="ni-skel" style={{ height: 15, width: '90%', marginBottom: 10 }} />
      <div className="ni-skel" style={{ height: 15, width: '75%', marginBottom: 10 }} />
      <div className="ni-skel" style={{ height: 15, width: '60%' }} />
    </div>
    <div className="ni-section">
      <div className="ni-section-label">SIGNAL x CATALYST CONFLUENCES</div>
      {[...Array(5)].map((_, i) => (
        <div key={i} className="ni-skel-row" style={{ opacity: 1 - i * 0.15 }} />
      ))}
    </div>
  </div>
);

// ── Confluence row ─────────────────────────────────────────────────────────
const ConfluenceRow = ({ c, muted = false }) => {
  const typeCfg = CONFLUENCE_TYPE[c.type] || CONFLUENCE_TYPE.CONFIRMED;
  const dirCls  = DIR_CLS[c.direction]  || 'dir-neutral';
  const dirArr  = DIR_ARROW[c.direction] || '→';

  return (
    <div className={`ni-conf-row${muted ? ' ni-conf-row--muted' : ''}`}>
      <div className="ni-conf-left">
        <span className={`ni-type-badge ${typeCfg.cls}`}>{typeCfg.label}</span>
        <div className="ni-conf-ticker-row">
          <span className="ni-conf-ticker">{c.ticker}</span>
          <span className={`ni-conf-dir ${dirCls}`}>{dirArr}</span>
        </div>
      </div>

      <div className="ni-conf-body">
        <span className="ni-conf-headline">{c.headline}</span>
        {c.insight && <span className="ni-conf-insight">{c.insight}</span>}
        {c.signal_context && <span className="ni-conf-context">{c.signal_context}</span>}
      </div>

      <div className="ni-conf-right">
        <span className="ni-conf-score">{(c.signal_score || 0).toFixed(1)}</span>
        {c.confidence && <span className="ni-conf-confidence">{c.confidence}</span>}
        {c.detected_at && (
          <span className="ni-conf-detected">{formatAge(c.detected_at)}</span>
        )}
      </div>
    </div>
  );
};

// ── Grouped confluence list ────────────────────────────────────────────────
const ConfluenceList = ({ confluences, muted = false }) => {
  const groups = groupByScan(confluences);
  return (
    <div className="ni-conf-list">
      {groups.map((group, gi) => (
        <React.Fragment key={gi}>
          {gi > 0 && (
            <div className="ni-scan-divider">
              Detected {formatAge(group[0].detected_at)}
            </div>
          )}
          {group.map((c, ci) => (
            <ConfluenceRow key={`${gi}-${ci}`} c={c} muted={muted} />
          ))}
        </React.Fragment>
      ))}
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────
const NewsIntelligence = () => {
  const [intel, setIntel]             = useState(null);
  const [activeConf, setActiveConf]   = useState([]);
  const [historyConf, setHistoryConf] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [confTab, setConfTab]         = useState('active'); // 'active' | 'today'

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE_URL}/news/intelligence`).then(r => r.json()),
      fetch(`${API_BASE_URL}/news/confluences`).then(r => r.json()),
      fetch(`${API_BASE_URL}/news/confluences/history`).then(r => r.json()),
    ])
      .then(([intelData, activeData, histData]) => {
        if (intelData.error) setError(intelData.error);
        else setIntel(intelData);
        setActiveConf(Array.isArray(activeData) ? activeData : []);
        setHistoryConf(Array.isArray(histData) ? histData : []);
      })
      .catch(() => setError('Failed to load news intelligence.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton />;

  if (error || !intel) {
    return (
      <div className="ni-page">
        <div className="ni-header">
          <span className="ni-title">NEWS RADAR</span>
        </div>
        <div className="ni-empty-state">
          <p>Analysis unavailable — will retry next hourly scan</p>
          {error && <p className="ni-empty-hint">{error}</p>}
        </div>
      </div>
    );
  }

  const sentimentCls = SENTIMENT_CLS[intel.overall_sentiment] || 'sent-neutral';
  const rotation     = intel.sector_rotation  || [];
  const flags        = intel.watchlist_flags  || [];
  const headlines    = intel.headlines         || [];
  const themes       = intel.macro_themes      || [];

  const displayedConf = confTab === 'active' ? activeConf : historyConf;
  const hasActive     = activeConf.length > 0;
  const hasHistory    = historyConf.length > 0;

  // "Active" shows non-expired; if none, show most-recent expired ones muted
  const showFallback  = confTab === 'active' && !hasActive && hasHistory;
  const fallbackConf  = showFallback
    ? historyConf.slice(0, Math.min(historyConf.length, 8))
    : [];

  return (
    <div className="ni-page">

      {/* ── Header ── */}
      <div className="ni-header">
        <span className="ni-title">NEWS RADAR</span>
        <div className="ni-header-right">
          <span className={`ni-sentiment-pill ${sentimentCls}`}>
            {intel.overall_sentiment || 'NEUTRAL'}
          </span>
          <span className="ni-meta-ts">
            Updated {formatAge(intel.recorded_at)} · {intel.headline_count || 0} headlines analyzed
          </span>
        </div>
      </div>

      {/* ── Macro narrative ── */}
      {intel.macro_summary && (
        <div className="ni-narrative-block">
          <p className="ni-macro-text">{intel.macro_summary}</p>
          {themes.length > 0 && (
            <div className="ni-themes">
              {themes.map((t, i) => <span key={i} className="ni-theme-pill">{t}</span>)}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════
          SIGNAL × CATALYST CONFLUENCES
      ════════════════════════════════════════ */}
      <div className="ni-section">
        <div className="ni-conf-section-header">
          <div className="ni-section-label">SIGNAL x CATALYST CONFLUENCES</div>
          <div className="ni-conf-tabs">
            <button
              className={`ni-conf-tab${confTab === 'active' ? ' ni-conf-tab--active' : ''}`}
              onClick={() => setConfTab('active')}
            >
              Active ({activeConf.length})
            </button>
            <button
              className={`ni-conf-tab${confTab === 'today' ? ' ni-conf-tab--active' : ''}`}
              onClick={() => setConfTab('today')}
            >
              All today ({historyConf.length})
            </button>
          </div>
        </div>

        {confTab === 'active' && !hasActive && !hasHistory && (
          <div className="ni-no-confluences">
            No confluences detected yet — analysis runs hourly
          </div>
        )}

        {showFallback && (
          <>
            <div className="ni-conf-fallback-note">
              No new confluences detected this scan — showing last known signals
            </div>
            <ConfluenceList confluences={fallbackConf} muted />
          </>
        )}

        {!showFallback && displayedConf.length > 0 && (
          <ConfluenceList confluences={displayedConf} />
        )}

        {confTab === 'today' && !hasHistory && (
          <div className="ni-no-confluences">
            No confluences detected in the last 24 hours
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════
          SECTOR ROTATION
      ════════════════════════════════════════ */}
      {rotation.length > 0 && (
        <div className="ni-section">
          <div className="ni-section-label">SECTOR ROTATION</div>
          <div className="ni-rotation-pills">
            {rotation.map((s, i) => {
              const arrow   = FLOW_ARROW[s.flow] || '→';
              const flowCls = FLOW_CLS[s.flow]   || 'flow-neutral';
              return (
                <span key={i} className="ni-sector-pill" title={s.reason}>
                  <span className={`ni-flow-arrow ${flowCls}`}>{arrow}</span>
                  {' '}{s.sector}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════
          FLAGS TO WATCH
      ════════════════════════════════════════ */}
      {flags.length > 0 && (
        <div className="ni-section">
          <div className="ni-section-label">FLAGS TO WATCH</div>
          <div className="ni-flag-list">
            {flags.map((f, i) => {
              const flagCfg = FLAG_TYPE[f.flag] || { cls: 'flag-amber' };
              return (
                <div key={i} className="ni-flag-row">
                  <span className={`ni-flag-badge ${flagCfg.cls}`}>
                    {(f.flag || '').replace(/_/g, ' ')}
                  </span>
                  <span className="ni-flag-ticker">{f.ticker}</span>
                  <span className="ni-flag-reason">{f.reason}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════
          HEADLINES ANALYZED — card grid
      ════════════════════════════════════════ */}
      {headlines.length > 0 && (
        <div className="ni-section">
          <div className="ni-section-label">HEADLINES ANALYZED ({headlines.length})</div>
          <div className="ni-headlines-grid">
            {headlines.map((h, i) => {
              const hasUrl    = !!h.url;
              const clickable = hasUrl ? ' ni-hl-card--clickable' : '';
              return (
                <div
                  key={i}
                  className={`ni-hl-card${clickable}`}
                  onClick={hasUrl ? () => window.open(h.url, '_blank') : undefined}
                >
                  <div className="ni-hl-card-top">
                    <span className="ni-hl-ticker">{h.ticker}</span>
                    <span className="ni-hl-ts">{formatArticleTs(h.datetime)}</span>
                  </div>
                  <span className="ni-hl-text">{h.headline}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
};

export default NewsIntelligence;
