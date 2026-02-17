import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { FaInfoCircle } from 'react-icons/fa';
import './MarketScanner.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

const MarketScanner = () => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [sortBy, setSortBy] = useState('alert_score');
  const [lastScanned, setLastScanned] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [polymarketEvents, setPolymarketEvents] = useState([]);
  const [watchlist, setWatchlist] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('foega_watchlist')) || [];
    } catch { return []; }
  });

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
      console.error('Error fetching history:', err);
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

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/alerts/cached`);
        const data = await response.json();
        
        if (data.error || !Array.isArray(data)) {
          setAlerts([]);
          setLoading(false);
          return;
        }
        
        setAlerts(data);

        // Use the most recent updated_at from Supabase if available
        const timestamps = data
          .map(a => a.updated_at)
          .filter(Boolean)
          .sort()
          .reverse();
        if (timestamps.length > 0) {
          setLastScanned(new Date(timestamps[0]));
        }

        setLoading(false);
      } catch (error) {
        console.error('Error fetching alerts:', error);
        setAlerts([]);
        setLoading(false);
      }
    };

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 5 * 60 * 1000);

    // Fetch Polymarket events
    fetch(`${API_BASE_URL}/polymarket/events`)
      .then(res => res.json())
      .then(events => { if (Array.isArray(events)) setPolymarketEvents(events); })
      .catch(err => console.error('Polymarket fetch error:', err));

    return () => clearInterval(interval);
  }, []);

  const sortedAlerts = [...alerts].sort((a, b) => {
    switch (sortBy) {
      case 'volume':
        return (b.volume_score || 0) - (a.volume_score || 0);
      case 'sentiment':
        return (b.sentiment_score || 0) - (a.sentiment_score || 0);
      case 'price':
        return Math.abs(b.price_change_pct || 0) - Math.abs(a.price_change_pct || 0);
      default:
        return (b.alert_score || 0) - (a.alert_score || 0);
    }
  });

  const getAlertClass = (level) => {
    const levels = { 'CRITICAL': 'alert-critical', 'HIGH': 'alert-high', 'MEDIUM': 'alert-medium' };
    return `alert-card ${levels[level] || 'alert-low'}`;
  };

  const getEmoji = (level) => {
    const emojis = { 'CRITICAL': '🚨', 'HIGH': '⚠️', 'MEDIUM': '⚡' };
    return emojis[level] || '📊';
  };

  const getPriceChangeClass = (change) => {
    if (change > 2) return 'price-up-strong';
    if (change > 0) return 'price-up';
    if (change < -2) return 'price-down-strong';
    if (change < 0) return 'price-down';
    return 'price-neutral';
  };

  const getPolymarketOdds = (ticker) => {
    const match = polymarketEvents.find(e => e.affected_tickers && e.affected_tickers.includes(ticker));
    if (!match) return null;
    return match;
  };

  const getSentimentEmoji = (score) => {
    if (score > 0.5) return '😊';
    if (score > 0.2) return '🙂';
    if (score > -0.2) return '😐';
    if (score > -0.5) return '😟';
    return '😢';
  };

  return (
    <div className="content-area market-scanner">
      <div className="header-wrapper">
        <h1 className="main-brand-title">📊 Market Scanner</h1>
        <p className="main-brand-tagline">
          Unified options flow, volume analysis & sentiment tracking
        </p>
      </div>

      {loading ? (
        <h3 className="loading-message">Loading market data...</h3>
      ) : alerts.length === 0 ? (
        <div className="empty-state">
          <h3>No alerts available</h3>
          <p>The scanner has not yet collected data. Trigger a scan via the <code>/alerts/scan</code> endpoint or wait for the next scheduled update.</p>
        </div>
      ) : (
        <>
          <div className="scanner-controls">
            <div className="alert-summary">
              <div className="stat-box critical">
                <span className="stat-number">{alerts.filter(a => a.alert_level === 'CRITICAL').length}</span>
                <span className="stat-label">Critical</span>
              </div>
              <div className="stat-box high">
                <span className="stat-number">{alerts.filter(a => a.alert_level === 'HIGH').length}</span>
                <span className="stat-label">High</span>
              </div>
              <div className="stat-box medium">
                <span className="stat-number">{alerts.filter(a => a.alert_level === 'MEDIUM').length}</span>
                <span className="stat-label">Medium</span>
              </div>
              <div className="stat-box low">
                <span className="stat-number">{alerts.filter(a => a.alert_level === 'LOW').length}</span>
                <span className="stat-label">Monitored</span>
              </div>
            </div>

            <div className="sort-controls">
              <label>Sort by:</label>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="alert_score">Alert Score</option>
                <option value="volume">Volume</option>
                <option value="sentiment">Sentiment</option>
                <option value="price">Price Change</option>
              </select>
            </div>
          </div>

          <div className="data-list scanner-grid">
            {sortedAlerts.map((alert, index) => (
              <div
                key={alert.ticker || index}
                className={getAlertClass(alert.alert_level)}
                onClick={() => { setSelectedAlert(alert); fetchHistory(alert.ticker); }}
              >
                <div className="alert-header">
                  <h2 className="alert-ticker">
                    {getEmoji(alert.alert_level)} {alert.ticker}
                  </h2>
                  <span className="alert-score" title="Weighted score: 40% options flow + 35% volume spike + 25% social buzz">
                    {(alert.alert_score || alert.early_warning_score || 0).toFixed(1)}
                    <FaInfoCircle className="score-info-icon" />
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

                {getPolymarketOdds(alert.ticker) && (() => {
                  const odds = getPolymarketOdds(alert.ticker);
                  return (
                    <div className="market-odds-badge">
                      <span className="odds-label">{odds.question.length > 25 ? odds.question.slice(0, 25) + '…' : odds.question}</span>
                      <span className="odds-value">{Math.round(odds.probability * 100)}%</span>
                    </div>
                  );
                })()}

                <div className="unified-signals">
                  <div className="signal-row" title="Unusual call option buying vs puts — high = institutions betting on a move">
                    <span className="signal-label">Options</span>
                    <span className="signal-bar">
                      <div className="signal-fill" style={{width: `${(alert.options_score || 0) * 10}%`}}/>
                    </span>
                    <span className="signal-value">{alert.options_score || 0}/10</span>
                  </div>

                  <div className="signal-row" title="Today's trading volume vs 30-day average — high = unusual activity">
                    <span className="signal-label">Volume</span>
                    <span className="signal-bar">
                      <div className="signal-fill volume" style={{width: `${(alert.volume_score || 0) * 10}%`}}/>
                    </span>
                    <span className="signal-value">{alert.volume_score || 0}/10</span>
                  </div>

                  <div className="signal-row" title="Reddit/WSB mention spike — high = retail crowd piling in">
                    <span className="signal-label">Social</span>
                    <span className="signal-bar">
                      <div className="signal-fill social" style={{width: `${(alert.social_score || 0) * 10}%`}}/>
                    </span>
                    <span className="signal-value">{alert.social_score || 0}/10</span>
                  </div>
                </div>

                <div className="signals-triggered">
                  {alert.signals_triggered || 0}/3 signals active
                </div>

                <button
                  className={`watch-btn ${watchlist.includes(alert.ticker) ? 'watched' : ''}`}
                  onClick={(e) => { e.stopPropagation(); toggleWatch(alert.ticker); }}
                >
                  {watchlist.includes(alert.ticker) ? 'Watching' : 'Watch'}
                </button>
              </div>
            ))}
          </div>

          <footer className="dashboard-footer">
            Monitoring {alerts.length} stocks. Auto-refresh every 5 minutes.
            {lastScanned && (
              <span className="last-scanned">
                {' '}| Last scanned: {lastScanned.toLocaleString()}
              </span>
            )}
          </footer>
        </>
      )}

      {selectedAlert && (
        <div className="modal-overlay" onClick={() => setSelectedAlert(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedAlert(null)}>×</button>
            <h2>{selectedAlert.ticker} - Complete Analysis</h2>

            <div className="modal-section">
              <h3>📊 Overview</h3>
              <p>Alert Score: {(selectedAlert.alert_score || 0).toFixed(2)}/10</p>
              <p>Alert Level: <span className={`alert-level-${(selectedAlert.alert_level || 'LOW').toLowerCase()}`}>{selectedAlert.alert_level}</span></p>
              <p>Price: ${(selectedAlert.current_price || 0).toFixed(2)} 
                <span className={getPriceChangeClass(selectedAlert.price_change_pct || 0)}>
                  {' '}({(selectedAlert.price_change_pct || 0) > 0 ? '+' : ''}{(selectedAlert.price_change_pct || 0).toFixed(2)}%)
                </span>
              </p>
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
              <h3>💭 Sentiment & News</h3>
              <p>Sentiment: {(selectedAlert.sentiment_score || 0).toFixed(3)} {getSentimentEmoji(selectedAlert.sentiment_score || 0)}</p>
              <p>News Articles (7d): {selectedAlert.news_count || 0}</p>
            </div>

            {(() => {
              const tickerEvents = polymarketEvents.filter(
                e => e.affected_tickers && e.affected_tickers.includes(selectedAlert.ticker)
              );
              if (tickerEvents.length === 0) return null;
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
                          <a
                            href={`https://polymarket.com/event/${evt.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="polymarket-link"
                            onClick={e => e.stopPropagation()}
                          >
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
                    <Tooltip
                      contentStyle={{ background: '#1a1a1a', border: '1px solid #444', borderRadius: 6 }}
                      labelStyle={{ color: '#aaa' }}
                      itemStyle={{ color: '#00ff88' }}
                    />
                    <Line type="monotone" dataKey="score" stroke="#00ff88" strokeWidth={2} dot={{ r: 3, fill: '#00ff88' }} />
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

export default MarketScanner;
