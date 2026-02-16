import React, { useState, useEffect } from 'react';
import './HeatmapView.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

const ALERT_COLORS = {
  CRITICAL: { bg: 'rgba(255, 68, 68, 0.35)', border: '#ff4444' },
  HIGH: { bg: 'rgba(255, 152, 0, 0.30)', border: '#ff9800' },
  MEDIUM: { bg: 'rgba(255, 193, 7, 0.25)', border: '#ffc107' },
  LOW: { bg: 'rgba(60, 60, 60, 0.5)', border: '#555' },
};

const HeatmapView = () => {
  const [tiles, setTiles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [alertsRes, moversRes] = await Promise.all([
          fetch(`${API_BASE_URL}/alerts/cached`),
          fetch(`${API_BASE_URL}/movers/cached`),
        ]);
        const alerts = await alertsRes.json();
        const movers = await moversRes.json();

        if (!Array.isArray(alerts)) { setLoading(false); return; }

        const moverMap = {};
        if (Array.isArray(movers)) {
          movers.forEach(m => { moverMap[m.ticker] = m; });
        }

        const combined = alerts.map(a => {
          const mover = moverMap[a.ticker] || {};
          return {
            ticker: a.ticker,
            alert_level: a.alert_level || 'LOW',
            price_change_pct: a.price_change_pct || 0,
            mover_score: mover.mover_score || 0,
          };
        });

        combined.sort((a, b) => b.mover_score - a.mover_score);
        setTiles(combined);
      } catch (err) {
        console.error('Heatmap fetch error:', err);
      }
      setLoading(false);
    };

    fetchData();
  }, []);

  // Scale tile size: base 80px, up to 160px for highest mover_score
  const maxScore = Math.max(...tiles.map(t => t.mover_score), 1);
  const getTileSize = (score) => 80 + Math.round((score / maxScore) * 80);

  return (
    <div className="content-area heatmap-view">
      <div className="header-wrapper">
        <h1 className="main-brand-title">Market Heatmap</h1>
        <p className="main-brand-tagline">Tile size reflects mover score, color reflects alert level</p>
      </div>

      {loading ? (
        <h3 className="loading-message">Loading heatmap...</h3>
      ) : tiles.length === 0 ? (
        <div className="empty-state">
          <h3>No data available</h3>
          <p>Run a scan via <code>/alerts/scan</code> to populate the heatmap.</p>
        </div>
      ) : (
        <>
          <div className="heatmap-legend">
            <span className="legend-item"><span className="legend-dot critical" /> Critical</span>
            <span className="legend-item"><span className="legend-dot high" /> High</span>
            <span className="legend-item"><span className="legend-dot medium" /> Medium</span>
            <span className="legend-item"><span className="legend-dot low" /> Low</span>
          </div>
          <div className="heatmap-grid">
            {tiles.map(tile => {
              const colors = ALERT_COLORS[tile.alert_level] || ALERT_COLORS.LOW;
              const size = getTileSize(tile.mover_score);
              const changePct = tile.price_change_pct || 0;
              return (
                <div
                  key={tile.ticker}
                  className="heatmap-tile"
                  style={{
                    width: size,
                    height: size,
                    background: colors.bg,
                    borderColor: colors.border,
                  }}
                >
                  <span className="heatmap-ticker">{tile.ticker}</span>
                  <span className={`heatmap-change ${changePct >= 0 ? 'up' : 'down'}`}>
                    {changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default HeatmapView;
