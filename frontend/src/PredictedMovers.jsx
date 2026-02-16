import React, { useState, useEffect } from 'react';
import './PredictedMovers.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

const PredictedMovers = () => {
  const [movers, setMovers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchMovers = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/movers/cached`);
        const data = await response.json();

        if (data.error || !Array.isArray(data)) {
          setMovers([]);
          setError(data.error || 'Unexpected response');
          setLoading(false);
          return;
        }

        setMovers(data);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching predicted movers:', err);
        setError('Failed to load predicted movers.');
        setLoading(false);
      }
    };

    fetchMovers();
  }, []);

  const getLabelClass = (label) => {
    switch (label) {
      case 'BREAKOUT': return 'mover-card mover-breakout';
      case 'WATCH': return 'mover-card mover-watch';
      default: return 'mover-card mover-neutral';
    }
  };

  return (
    <div className="content-area predicted-movers">
      <div className="header-wrapper">
        <h1 className="main-brand-title">Predicted Big Movers</h1>
        <p className="main-brand-tagline">
          Composite scoring: alert signals + momentum + price level analysis
        </p>
      </div>

      {loading ? (
        <h3 className="loading-message">Analyzing price momentum and levels...</h3>
      ) : error ? (
        <div className="empty-state">
          <h3>Unable to load movers</h3>
          <p>{error}</p>
        </div>
      ) : movers.length === 0 ? (
        <div className="empty-state">
          <h3>No predicted movers available</h3>
          <p>Run a scan via <code>/alerts/scan</code> first so alert scores are populated.</p>
        </div>
      ) : (
        <>
          <div className="movers-summary">
            <div className="stat-box breakout-stat">
              <span className="stat-number">{movers.filter(m => m.label === 'BREAKOUT').length}</span>
              <span className="stat-label">Breakout</span>
            </div>
            <div className="stat-box watch-stat">
              <span className="stat-number">{movers.filter(m => m.label === 'WATCH').length}</span>
              <span className="stat-label">Watch</span>
            </div>
            <div className="stat-box neutral-stat">
              <span className="stat-number">{movers.filter(m => m.label === 'NEUTRAL').length}</span>
              <span className="stat-label">Neutral</span>
            </div>
          </div>

          <div className="movers-grid">
            {movers.map((mover) => (
              <div key={mover.ticker} className={getLabelClass(mover.label)}>
                <div className="mover-header">
                  <h2 className="mover-ticker">{mover.ticker}</h2>
                  <span className="mover-score">{mover.mover_score.toFixed(1)}</span>
                </div>

                <div className="mover-label-badge">{mover.label}</div>

                <div className="mover-details">
                  <div className="mover-detail-row">
                    <span className="detail-label">Price</span>
                    <span className="detail-value">${mover.current_price.toFixed(2)}</span>
                  </div>
                  <div className="mover-detail-row">
                    <span className="detail-label">5d Momentum</span>
                    <span className={`detail-value ${mover.momentum_pct >= 0 ? 'momentum-up' : 'momentum-down'}`}>
                      {mover.momentum_pct >= 0 ? '+' : ''}{mover.momentum_pct.toFixed(2)}%
                    </span>
                  </div>
                  <div className="mover-detail-row">
                    <span className="detail-label">Alert Score</span>
                    <span className="detail-value">{mover.early_warning_score.toFixed(1)}/10</span>
                  </div>
                </div>

                <div className="mover-flags">
                  {mover.near_52w_high && <span className="flag flag-52w">Near 52w High</span>}
                  {mover.near_round_number && <span className="flag flag-round">Round Number</span>}
                </div>
              </div>
            ))}
          </div>

          <footer className="dashboard-footer">
            Analyzed {movers.length} tickers for breakout potential.
          </footer>
        </>
      )}
    </div>
  );
};

export default PredictedMovers;
