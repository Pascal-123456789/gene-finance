import React, { useState, useEffect } from 'react';
import './HeatmapView.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

const SECTOR_MAP = {
  "Tech": [
    { ticker: "AAPL", name: "Apple" }, { ticker: "MSFT", name: "Microsoft" },
    { ticker: "GOOGL", name: "Alphabet" }, { ticker: "AMZN", name: "Amazon" },
    { ticker: "META", name: "Meta" }, { ticker: "NVDA", name: "Nvidia" },
    { ticker: "TSLA", name: "Tesla" }, { ticker: "NFLX", name: "Netflix" },
  ],
  "Semiconductors": [
    { ticker: "AMD", name: "AMD" }, { ticker: "INTC", name: "Intel" },
    { ticker: "AVGO", name: "Broadcom" }, { ticker: "QCOM", name: "Qualcomm" },
    { ticker: "TSM", name: "TSMC" }, { ticker: "MU", name: "Micron" },
  ],
  "Fintech": [
    { ticker: "V", name: "Visa" }, { ticker: "MA", name: "Mastercard" },
    { ticker: "PYPL", name: "PayPal" }, { ticker: "XYZ", name: "Block" },
    { ticker: "COIN", name: "Coinbase" }, { ticker: "HOOD", name: "Robinhood" },
    { ticker: "SOFI", name: "SoFi" },
  ],
  "Meme & Social": [
    { ticker: "GME", name: "GameStop" }, { ticker: "AMC", name: "AMC" },
    { ticker: "PLTR", name: "Palantir" }, { ticker: "SNAP", name: "Snap" },
    { ticker: "RBLX", name: "Roblox" },
  ],
  "Growth": [
    { ticker: "UBER", name: "Uber" }, { ticker: "LYFT", name: "Lyft" },
    { ticker: "ABNB", name: "Airbnb" }, { ticker: "DASH", name: "DoorDash" },
    { ticker: "SPOT", name: "Spotify" }, { ticker: "ZM", name: "Zoom" },
  ],
  "Finance": [
    { ticker: "JPM", name: "JPMorgan" }, { ticker: "BAC", name: "BofA" },
    { ticker: "GS", name: "Goldman" }, { ticker: "MS", name: "Morgan Stanley" },
    { ticker: "WFC", name: "Wells Fargo" },
  ],
  "Healthcare": [
    { ticker: "JNJ", name: "J&J" }, { ticker: "UNH", name: "UnitedHealth" },
    { ticker: "PFE", name: "Pfizer" }, { ticker: "ABBV", name: "AbbVie" },
    { ticker: "LLY", name: "Eli Lilly" },
  ],
  "Energy": [
    { ticker: "XOM", name: "Exxon" }, { ticker: "CVX", name: "Chevron" },
    { ticker: "COP", name: "Conoco" }, { ticker: "SLB", name: "SLB" },
  ],
  "Consumer": [
    { ticker: "WMT", name: "Walmart" }, { ticker: "HD", name: "Home Depot" },
    { ticker: "NKE", name: "Nike" }, { ticker: "MCD", name: "McDonald's" },
  ],
};

// Build a flat lookup: ticker -> { name, sector }
const TICKER_INFO = {};
Object.entries(SECTOR_MAP).forEach(([sector, tickers]) => {
  tickers.forEach(t => { TICKER_INFO[t.ticker] = { name: t.name, sector }; });
});

function getSignalColor(moverScore) {
  // Background gradient based on mover_score (0-10)
  // 0 → dark grey, 10 → bright teal/green (our signal color)
  const clamped = Math.max(0, Math.min(10, moverScore));
  const t = clamped / 10;
  const h = 160; // teal-green
  const s = Math.round(t * 65);
  const l = 16 + Math.round(t * 12);
  return `hsl(${h}, ${s}%, ${l}%)`;
}

function getAlertBorder(alertLevel) {
  switch (alertLevel) {
    case 'CRITICAL': return '2px solid #ff3333';
    case 'HIGH': return '2px solid #ff9900';
    case 'MEDIUM': return '1px solid rgba(255, 255, 255, 0.15)';
    default: return '1px solid rgba(255, 255, 255, 0.06)';
  }
}

function getAlertClass(alertLevel) {
  switch (alertLevel) {
    case 'CRITICAL': return 'alert-critical';
    case 'HIGH': return 'alert-high';
    default: return '';
  }
}

const HeatmapView = ({ onTickerClick }) => {
  const [dataMap, setDataMap] = useState({});
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

        const map = {};

        if (Array.isArray(alerts)) {
          alerts.forEach(a => {
            map[a.ticker] = {
              price_change_pct: a.price_change_pct || 0,
              alert_level: a.alert_level || 'LOW',
              options_score: a.options_score || 0,
              volume_score: a.volume_score || 0,
              social_score: a.social_score || 0,
              alert_score: a.alert_score || 0,
            };
          });
        }

        if (Array.isArray(movers)) {
          movers.forEach(m => {
            if (!map[m.ticker]) map[m.ticker] = {};
            map[m.ticker].mover_score = m.mover_score || 0;
          });
        }

        setDataMap(map);
      } catch (err) {
        console.error('Heatmap fetch error:', err);
      }
      setLoading(false);
    };

    fetchData();
  }, []);

  const hasData = Object.keys(dataMap).length > 0;

  return (
    <div className="content-area heatmap-view">
      <div className="heatmap-header">
        <h1 className="heatmap-title">Market Heatmap</h1>
        <p className="heatmap-subtitle">Color & size = Foega signal strength. Price change shown inside.</p>
        <div className="heatmap-legend-bar">
          <span className="legend-label">Low signal</span>
          <div className="legend-gradient" />
          <span className="legend-label">High signal</span>
        </div>
        <div className="heatmap-legend-alerts">
          <span className="legend-alert-item critical-border">CRITICAL</span>
          <span className="legend-alert-item high-border">HIGH</span>
        </div>
      </div>

      {loading ? (
        <h3 className="loading-message">Loading heatmap...</h3>
      ) : !hasData ? (
        <div className="empty-state">
          <h3>No data available</h3>
          <p>Run a scan via <code>/alerts/scan</code> to populate the heatmap.</p>
        </div>
      ) : (
        <div className="heatmap-sectors">
          {Object.entries(SECTOR_MAP).map(([sector, tickers]) => {
            const sectorTickers = tickers.filter(t => dataMap[t.ticker]);
            if (sectorTickers.length === 0) return null;

            return (
              <div key={sector} className="heatmap-sector">
                <h2 className="heatmap-sector-label">{sector}</h2>
                <div className="heatmap-sector-grid">
                  {sectorTickers.map(({ ticker, name }) => {
                    const d = dataMap[ticker] || {};
                    const pct = d.price_change_pct || 0;
                    const moverScore = d.mover_score || 0;
                    const alertLevel = d.alert_level || 'LOW';
                    const optionsScore = d.options_score || 0;
                    const volumeScore = d.volume_score || 0;
                    const bgColor = getSignalColor(moverScore);
                    const border = getAlertBorder(alertLevel);
                    const alertClass = getAlertClass(alertLevel);
                    // Size by mover_score: higher signal = bigger tile
                    const flex = Math.max(1, 1 + moverScore / 2);
                    const showFire = optionsScore >= 6 || volumeScore >= 6;

                    return (
                      <div
                        key={ticker}
                        className={`heatmap-tile ${alertClass}`}
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
                        <span className="tile-signal">Signal: {moverScore.toFixed(1)}</span>
                        <div className="tile-tooltip">
                          <div><strong>{name}</strong> ({ticker})</div>
                          <div>Alert: {alertLevel}</div>
                          <div>Mover Score: {moverScore.toFixed(1)}</div>
                          <div>Options: {optionsScore}/10</div>
                          <div>Volume: {volumeScore}/10</div>
                          <div>Social: {d.social_score || 0}/10</div>
                          <div>Price: {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default HeatmapView;
