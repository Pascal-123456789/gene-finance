import React, { useState, useEffect } from 'react';
import './MarketScanner.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
const WATCHLIST_KEY = 'foega_watchlist';

const WatchlistView = () => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [watchlist, setWatchlist] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(WATCHLIST_KEY)) || [];
    } catch { return []; }
  });

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/alerts/cached`);
        const data = await response.json();
        if (!data.error && Array.isArray(data)) {
          setAlerts(data);
        }
      } catch (err) {
        console.error('Error fetching alerts:', err);
      }
      setLoading(false);
    };
    fetchAlerts();
  }, []);

  const removeFromWatchlist = (ticker) => {
    const updated = watchlist.filter(t => t !== ticker);
    setWatchlist(updated);
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(updated));
  };

  const watchedAlerts = alerts.filter(a => watchlist.includes(a.ticker));

  const getAlertClass = (level) => {
    const levels = { 'CRITICAL': 'alert-critical', 'HIGH': 'alert-high', 'MEDIUM': 'alert-medium' };
    return `alert-card ${levels[level] || 'alert-low'}`;
  };

  const getPriceChangeClass = (change) => {
    if (change > 2) return 'price-up-strong';
    if (change > 0) return 'price-up';
    if (change < -2) return 'price-down-strong';
    if (change < 0) return 'price-down';
    return 'price-neutral';
  };

  const getEmoji = (level) => {
    const emojis = { 'CRITICAL': '🚨', 'HIGH': '⚠️', 'MEDIUM': '⚡' };
    return emojis[level] || '📊';
  };

  return (
    <div className="content-area market-scanner">
      <div className="header-wrapper">
        <h1 className="main-brand-title">Watchlist</h1>
        <p className="main-brand-tagline">
          Your tracked tickers ({watchlist.length} watched)
        </p>
      </div>

      {loading ? (
        <h3 className="loading-message">Loading watchlist data...</h3>
      ) : watchlist.length === 0 ? (
        <div className="empty-state">
          <h3>No tickers watched</h3>
          <p>Add tickers from the Market Scanner by clicking the Watch button on any alert card.</p>
        </div>
      ) : watchedAlerts.length === 0 ? (
        <div className="empty-state">
          <h3>No alert data for watched tickers</h3>
          <p>Your watchlist has {watchlist.length} ticker(s) but no alert data is available yet.</p>
        </div>
      ) : (
        <>
          <div className="data-list scanner-grid">
            {watchedAlerts.map((alert, index) => (
              <div
                key={alert.ticker || index}
                className={getAlertClass(alert.alert_level)}
              >
                <div className="alert-header">
                  <h2 className="alert-ticker">
                    {getEmoji(alert.alert_level)} {alert.ticker}
                  </h2>
                  <span className="alert-score">
                    {(alert.alert_score || alert.early_warning_score || 0).toFixed(1)}
                  </span>
                </div>

                <div className="price-info">
                  <span className="current-price">
                    ${(alert.current_price || 0).toFixed(2)}
                  </span>
                  <span className={`price-change ${getPriceChangeClass(alert.price_change_pct || 0)}`}>
                    {(alert.price_change_pct || 0) > 0 ? '+' : ''}
                    {(alert.price_change_pct || 0).toFixed(2)}%
                  </span>
                </div>

                <div className="alert-level-badge">
                  {alert.alert_level}
                </div>

                <div className="unified-signals">
                  <div className="signal-row">
                    <span className="signal-label">Options</span>
                    <span className="signal-bar">
                      <div className="signal-fill" style={{width: `${(alert.options_score || 0) * 10}%`}}/>
                    </span>
                    <span className="signal-value">{alert.options_score || 0}/10</span>
                  </div>
                  <div className="signal-row">
                    <span className="signal-label">Volume</span>
                    <span className="signal-bar">
                      <div className="signal-fill volume" style={{width: `${(alert.volume_score || 0) * 10}%`}}/>
                    </span>
                    <span className="signal-value">{alert.volume_score || 0}/10</span>
                  </div>
                  <div className="signal-row">
                    <span className="signal-label">Social</span>
                    <span className="signal-bar">
                      <div className="signal-fill social" style={{width: `${(alert.social_score || 0) * 10}%`}}/>
                    </span>
                    <span className="signal-value">{alert.social_score || 0}/10</span>
                  </div>
                </div>

                <button
                  className="watch-btn watched"
                  onClick={(e) => { e.stopPropagation(); removeFromWatchlist(alert.ticker); }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <footer className="dashboard-footer">
            Watching {watchedAlerts.length} of {watchlist.length} tickers.
          </footer>
        </>
      )}
    </div>
  );
};

export default WatchlistView;
