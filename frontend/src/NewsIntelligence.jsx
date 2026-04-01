import React, { useState, useEffect } from 'react';
import './NewsIntelligence.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

const SENTIMENT_CLS = {
  BULLISH: 'bullish',
  BEARISH: 'bearish',
  MIXED: 'mixed',
  NEUTRAL: 'neutral',
};

const DIRECTION_CFG = {
  POSITIVE: { arrow: '▲', cls: 'positive' },
  NEGATIVE: { arrow: '▼', cls: 'negative' },
  NEUTRAL:  { arrow: '→', cls: 'neutral' },
  MIXED:    { arrow: '↔', cls: 'mixed' },
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

const LoadingSkeleton = () => (
  <div className="content-area news-intelligence">
    <div className="ni-header skeleton-box" style={{ height: 140 }} />
    <div className="ni-section">
      <div className="skeleton-box" style={{ height: 24, width: 160, marginBottom: 14 }} />
      <div className="ni-sector-grid">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton-box" style={{ height: 110 }} />
        ))}
      </div>
    </div>
    <div className="ni-section">
      <div className="skeleton-box" style={{ height: 24, width: 140, marginBottom: 14 }} />
      <div className="skeleton-box" style={{ height: 200 }} />
    </div>
  </div>
);

const NewsIntelligence = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [headlinesOpen, setHeadlinesOpen] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE_URL}/news/intelligence`)
      .then(res => res.json())
      .then(json => {
        if (json.error) setError(json.error);
        else setData(json);
      })
      .catch(() => setError('Failed to load news intelligence.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton />;

  if (error || !data) {
    return (
      <div className="content-area news-intelligence">
        <div className="ni-empty">
          <h2>📰 News Radar</h2>
          <p>{error || 'No data available yet.'}</p>
          <p className="ni-hint">News analysis runs automatically each hour alongside the market scan. Check back after the next scheduled update.</p>
        </div>
      </div>
    );
  }

  const sentimentCls = SENTIMENT_CLS[data.overall_sentiment] || 'neutral';

  const sortedSectors = [...(data.sector_impacts || [])].sort((a, b) => {
    const order = { NEGATIVE: 0, POSITIVE: 1, MIXED: 2, NEUTRAL: 3 };
    return (order[a.direction] ?? 3) - (order[b.direction] ?? 3);
  });

  const sortedTickers = [...(data.ticker_impacts || [])].sort((a, b) => (b.magnitude || 0) - (a.magnitude || 0));

  return (
    <div className="content-area news-intelligence">

      {/* ── Header banner: title + sentiment + meta ── */}
      <div className="ni-header">
        <h1 className="ni-title">📰 News Radar</h1>
        <div className="ni-header-meta">
          <span className={`ni-sentiment-pill ni-sentiment-${sentimentCls}`}>
            {data.overall_sentiment || 'NEUTRAL'}
          </span>
          <span className="ni-timestamp">Updated {formatAge(data.recorded_at)}</span>
          <span className="ni-headline-count">{data.headline_count || 0} headlines analyzed</span>
        </div>
      </div>

      {/* ── Macro Summary card ── */}
      <section className="ni-section">
        <h2 className="ni-section-title">Market Narrative</h2>
        <div className="ni-summary-card">
          <p className="ni-macro-summary">
            {data.macro_summary || <span className="ni-no-data">No summary available.</span>}
          </p>
          {(data.macro_themes || []).length > 0 && (
            <div className="ni-themes">
              {data.macro_themes.map((theme, i) => (
                <span key={i} className="ni-theme-pill">{theme}</span>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Sector Impacts ── */}
      <section className="ni-section">
        <h2 className="ni-section-title">Sector Impacts</h2>
        {sortedSectors.length === 0 ? (
          <p className="ni-no-data">No sector impacts identified in this analysis.</p>
        ) : (
          <div className="ni-sector-grid">
            {sortedSectors.map((s, i) => {
              const cfg = DIRECTION_CFG[s.direction] || DIRECTION_CFG.NEUTRAL;
              return (
                <div key={i} className={`ni-sector-card ni-sector-${cfg.cls}`}>
                  <div className="ni-sector-header">
                    <span className="ni-sector-name">{s.sector}</span>
                    <span className={`ni-sector-arrow ni-arrow-${cfg.cls}`}>{cfg.arrow}</span>
                  </div>
                  <p className="ni-sector-reason">{s.reason}</p>
                  <span className={`ni-confidence ni-confidence-${(s.confidence || 'LOW').toLowerCase()}`}>
                    {s.confidence}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Ticker Impacts ── */}
      <section className="ni-section">
        <h2 className="ni-section-title">Ticker Impacts</h2>
        {sortedTickers.length === 0 ? (
          <p className="ni-no-data">No ticker impacts identified in this analysis.</p>
        ) : (
          <div className="ni-ticker-table">
            <div className="ni-ticker-header">
              <span>Ticker</span>
              <span>Direction</span>
              <span>Magnitude</span>
              <span>Reason</span>
            </div>
            {sortedTickers.map((t, i) => {
              const cfg = DIRECTION_CFG[t.direction] || DIRECTION_CFG.NEUTRAL;
              return (
                <div key={i} className="ni-ticker-row">
                  <span className="ni-ticker-symbol">{t.ticker}</span>
                  <span className={`ni-ticker-dir ni-arrow-${cfg.cls}`}>
                    {cfg.arrow} {t.direction}
                  </span>
                  <div className="ni-magnitude-cell">
                    <div className="ni-magnitude-bar">
                      <div
                        className={`ni-magnitude-fill ni-fill-${cfg.cls}`}
                        style={{ width: `${(t.magnitude || 0) * 10}%` }}
                      />
                    </div>
                    <span className="ni-magnitude-value">{t.magnitude || 0}/10</span>
                  </div>
                  <span className="ni-ticker-reason">{t.reason}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Headlines collapsible ── */}
      <section className="ni-section">
        <button
          className="ni-headlines-toggle"
          onClick={() => setHeadlinesOpen(o => !o)}
        >
          {headlinesOpen ? '▾' : '▸'} Headlines Analyzed ({(data.headlines || []).length})
        </button>
        {headlinesOpen && (
          <div className="ni-headlines-list">
            {(data.headlines || []).map((h, i) => (
              <div key={i} className="ni-headline-item">
                <span className="ni-headline-ticker">{h.ticker}</span>
                <span className="ni-headline-text">{h.headline}</span>
              </div>
            ))}
          </div>
        )}
      </section>

    </div>
  );
};

export default NewsIntelligence;
