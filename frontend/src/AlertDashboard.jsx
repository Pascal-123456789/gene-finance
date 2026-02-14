import React, { useState, useEffect } from 'react';
import './AlertDashboard.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

const AlertDashboard = () => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAlert, setSelectedAlert] = useState(null);

  // Fetch alerts from backend
  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/alerts/cached`);
        const data = await response.json();
        setAlerts(data);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching alerts:', error);
        setLoading(false);
      }
    };

    fetchAlerts();

    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchAlerts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Get color class based on alert level
  const getAlertClass = (level) => {
    switch (level) {
      case 'CRITICAL': return 'alert-card alert-critical';
      case 'HIGH': return 'alert-card alert-high';
      case 'MEDIUM': return 'alert-card alert-medium';
      default: return 'alert-card alert-low';
    }
  };

  // Get emoji for alert level
  const getEmoji = (level) => {
    switch (level) {
      case 'CRITICAL': return '🚨';
      case 'HIGH': return '⚠️';
      case 'MEDIUM': return '⚡';
      default: return '📊';
    }
  };

  return (
    <div className="content-area alert-dashboard">
      <div className="header-wrapper">
        <h1 className="main-brand-title">🎯 Market Activity Alerts</h1>
        <p className="main-brand-tagline">
          Real-time detection of unusual options flow & volume spikes
        </p>
      </div>

      {loading ? (
        <h3 className="loading-message">Loading alerts...</h3>
      ) : (
        <>
          {/* Summary Stats */}
          <div className="alert-summary">
            <div className="stat-box critical">
              <span className="stat-number">
                {alerts.filter(a => a.alert_level === 'CRITICAL').length}
              </span>
              <span className="stat-label">Critical</span>
            </div>
            <div className="stat-box high">
              <span className="stat-number">
                {alerts.filter(a => a.alert_level === 'HIGH').length}
              </span>
              <span className="stat-label">High</span>
            </div>
            <div className="stat-box medium">
              <span className="stat-number">
                {alerts.filter(a => a.alert_level === 'MEDIUM').length}
              </span>
              <span className="stat-label">Medium</span>
            </div>
            <div className="stat-box low">
              <span className="stat-number">
                {alerts.filter(a => a.alert_level === 'LOW').length}
              </span>
              <span className="stat-label">Monitored</span>
            </div>
          </div>

          {/* Alert Cards */}
          <div className="data-list alert-grid">
            {alerts.map((alert, index) => (
              <div
                key={alert.ticker || index}
                className={getAlertClass(alert.alert_level)}
                onClick={() => setSelectedAlert(alert)}
              >
                <div className="alert-header">
                  <h2 className="alert-ticker">
                    {getEmoji(alert.alert_level)} {alert.ticker}
                  </h2>
                  <span className="alert-score">
                    {alert.early_warning_score.toFixed(1)}
                  </span>
                </div>

                <div className="alert-level-badge">
                  {alert.alert_level}
                </div>

                <div className="alert-signals">
                  <div className="signal-item">
                    <span className="signal-label">Options</span>
                    <span className="signal-value">
                      {alert.options_score}/10
                    </span>
                  </div>
                  <div className="signal-item">
                    <span className="signal-label">Volume</span>
                    <span className="signal-value">
                      {alert.volume_score}/10
                    </span>
                  </div>
                  <div className="signal-item">
                    <span className="signal-label">Signals</span>
                    <span className="signal-value">
                      {alert.signals_triggered}/2
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <footer className="dashboard-footer">
            Monitoring {alerts.length} tickers. Data refreshes every 5 minutes.
          </footer>
        </>
      )}

      {/* Detail Modal */}
      {selectedAlert && (
        <div className="modal-overlay" onClick={() => setSelectedAlert(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button 
              className="modal-close" 
              onClick={() => setSelectedAlert(null)}
            >
              ×
            </button>

            <h2>{selectedAlert.ticker} - Detailed Analysis</h2>

            <div className="modal-section">
              <h3>
                Early Warning Score: {selectedAlert.early_warning_score.toFixed(2)}
              </h3>
              <p className={`alert-level-${selectedAlert.alert_level.toLowerCase()}`}>
                Alert Level: {selectedAlert.alert_level}
              </p>
              <p>Signals Triggered: {selectedAlert.signals_triggered}/2</p>
            </div>

<div className="modal-section">
  <h3>📊 Options Activity</h3>
  <p>Score: {selectedAlert.options_score}/10</p>
  {selectedAlert.options_signal?.call_put_ratio ? (
    <>
      <p>Signal: {selectedAlert.options_signal.signal}</p>
      <p>Call/Put Ratio: {selectedAlert.options_signal.call_put_ratio}</p>
      <p>Call Volume: {selectedAlert.options_signal.total_call_volume?.toLocaleString()}</p>
      <p>Put Volume: {selectedAlert.options_signal.total_put_volume?.toLocaleString()}</p>
    </>
  ) : (
    <p className="signal-note">
      Click refresh to load detailed metrics
    </p>
  )}
</div>

<div className="modal-section">
  <h3>📈 Volume Analysis</h3>
  <p>Score: {selectedAlert.volume_score}/10</p>
  {selectedAlert.volume_signal?.volume_ratio_today ? (
    <>
      <p>Signal: {selectedAlert.volume_signal.signal}</p>
      <p>Today's Volume: {selectedAlert.volume_signal.volume_ratio_today}x average</p>
      <p>5-Day Average: {selectedAlert.volume_signal.volume_ratio_5d}x normal</p>
      <p>Volatility: {selectedAlert.volume_signal.volatility_ratio}x baseline</p>
    </>
  ) : (
    <p className="signal-note">
      Click refresh to load detailed metrics
    </p>
  )}
</div>

            <div className="modal-footer">
              Last updated: {new Date(selectedAlert.timestamp).toLocaleString()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AlertDashboard;
