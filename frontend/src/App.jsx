import React, { useState, useEffect } from 'react';
import './App.css';
import { FaFire, FaChartLine, FaLock, FaBars, FaCalculator, FaLayerGroup } from 'react-icons/fa';

const API_BASE_URL = 'http://127.0.0.1:8000';

// --- HELPER FUNCTIONS ---
const getHypeClass = (score) => {
    if (score > 1.0) return 'ticker-card hype-positive-strong';
    if (score > 0.3) return 'ticker-card hype-positive';
    if (score < -1.0) return 'ticker-card hype-negative-strong';
    if (score < -0.3) return 'ticker-card hype-negative';
    return 'ticker-card hype-neutral';
};

// --- COMPONENT: GrowthModeler (Fixed Internal Definition) ---
const GrowthModeler = ({ setCurrentView, setSectorFilter }) => {
    const [mode, setMode] = useState('predict');
    const [calc, setCalc] = useState({ initial: 1000, monthly: 100, years: 10, rate: 0.08, target: 100000 });

    const getPortfolioSuggestion = (rate) => {
        if (rate <= 0.05) return { text: "Conservative: 80% Bonds, 20% Blue Chip Stocks", sector: "thematic", filter: "Consumer Luxury"};
        if (rate <= 0.09) return { text: "Balanced: 60% S&P 500 ETF, 40% Growth Stocks", sector: "thematic", filter: "Semiconductors"};
        return { text: "Aggressive: 70% Tech/Growth, 30% Emerging Sectors", sector: "thematic", filter: "Cyber-Defense"};
    };

    const calculateOutput = () => {
        const { initial, monthly, years, rate, target } = calc;
        const r = rate / 12;
        if (mode === 'predict') {
            const n = years * 12;
            const compoundFactor = Math.pow(1 + r, n);
            const total = (initial * compoundFactor) + (monthly * (compoundFactor - 1) / r);
            return { label: "Estimated Future Value", value: `$${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}` };
        } else {
            const nMonths = Math.log((target * r + monthly) / (initial * r + monthly)) / Math.log(1 + r);
            const nYears = (nMonths / 12).toFixed(1);
            return { label: "Realistic Timeline", value: `${nYears} Years` };
        }
    };

    const result = calculateOutput();
    const suggestion = getPortfolioSuggestion(calc.rate);

    return (
        <div className="content-area">
            <div className="card-header">
                <h2>📈 Growth Modeler</h2>
                <button className="mode-toggle" onClick={() => setMode(mode === 'predict' ? 'goal' : 'predict')}>
                    {mode === 'predict' ? "Or tell us what you want to reach" : "Back to Predict Growth"}
                </button>
            </div>

            <div className="calc-grid">
                <div className="input-group">
                    <label>Starting Amount ($)</label>
                    <input type="number" value={calc.initial} onChange={e => setCalc({ ...calc, initial: +e.target.value })} />
                </div>
                <div className="input-group">
                    <label>Monthly Addition ($)</label>
                    <input type="number" value={calc.monthly} onChange={e => setCalc({ ...calc, monthly: +e.target.value })} />
                </div>

                {mode === 'predict' ? (
                    <div className="input-group">
                        <label>Years to Invest</label>
                        <input type="number" value={calc.years} onChange={e => setCalc({ ...calc, years: +e.target.value })} />
                    </div>
                ) : (
                        <div className="input-group">
                            <label>Target Goal ($)</label>
                            <input type="number" value={calc.target} onChange={e => setCalc({ ...calc, target: +e.target.value })} />
                        </div>
                    )}

                <div className="input-group">
                    <label>Strategy (Expected Return)</label>
                    <select value={calc.rate} onChange={e => setCalc({ ...calc, rate: +e.target.value })}>
                        <option value={0.04}>Safe (4% Annually)</option>
                        <option value={0.08}>Balanced (8% Annually)</option>
                        <option value={0.12}>Aggressive (12% Annually)</option>
                    </select>
                </div>
            </div>

            <div className="result-display">
                <h3>{result.label}: <span>{result.value}</span></h3>
                {/* 2. UPDATE this onClick to set the filter before switching views */}
                <div className="portfolio-suggestion"
                    onClick={() => {
                        setSectorFilter(suggestion.filter);
                        setCurrentView(suggestion.sector);
                    }}
                    style={{ cursor: 'pointer' }}>
                    <p><strong>Suggested Allocation:</strong> {suggestion.text}</p>
                    <span className="view-sector-link">Click here to view these sectors →</span>
                </div>
            </div>
        </div>
    );
};

// --- COMPONENT: PremiumAnalysisView ---
const PremiumAnalysisView = ({ data }) => {
    const [selectedTicker, setSelectedTicker] = useState(data.length > 0 ? data[0].ticker : null);
    const [analysisData, setAnalysisData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!selectedTicker) return;
        const fetchAnalysis = async () => {
            setLoading(true);
            try {
                const response = await fetch(`${API_BASE_URL}/premium/walk_forward/${selectedTicker}`);
                const result = await response.json();
                setAnalysisData(result);
            } catch (e) { setError(e.message); }
            finally { setLoading(false); }
        };
        fetchAnalysis();
    }, [selectedTicker]);

    if (data.length === 0) return <div className="content-area premium-page"><p>No trending tickers loaded. Check dashboard data.</p></div>;

    return (
        <div className="content-area premium-page">
            <h2>💎 Walk-Forward Trader Bot Analysis</h2>
            <p className="premium-intro">Select a ticker to view proprietary backtesting results, optimal strategy parameters, and performance metrics.</p>
            <div className="ticker-selector-wrapper">
                <label htmlFor="ticker-select">Select Ticker:</label>
                <select id="ticker-select" value={selectedTicker || ''} onChange={e => setSelectedTicker(e.target.value)}>
                    {data.map(item => <option key={item.ticker} value={item.ticker}>{item.ticker}</option>)}
                </select>
            </div>
            {loading && <h3 className="loading-message">Running Walk-Forward Simulation... (This may take a few seconds)</h3>}
            {analysisData && (
                <div className="analysis-results">
                    <h3>Analysis for **{analysisData.ticker}**</h3>
                    <div className="analysis-section">
                        <h4>Optimal Strategy Parameters</h4>
                        <div className="param-grid">
                            {Object.entries(analysisData.optimal_params).map(([key, value]) => (
                                <div key={key} className="param-item"><span className="param-label">{key}:</span> <span className="param-value">{value}</span></div>
                            ))}
                        </div>
                    </div>
                    <div className="analysis-section">
                        <h4>Performance Metrics (Out-of-Sample)</h4>
                        <div className="metric-grid">
                            {Object.entries(analysisData.performance_metrics).map(([key, value]) => (
                                <div key={key} className="metric-item">
                                    <span className="metric-label">{key.replace('_', ' ')}:</span>
                                    <span className="metric-value">{key === 'Max_Drawdown' || key === 'CAGR' ? `${(value * 100).toFixed(2)}%` : value.toFixed(2)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="analysis-section">
                        <h4>Walk-Forward Trading Periods</h4>
                        <table className="trading-periods-table">
                            <thead><tr><th>Period</th><th>Start/End Date</th><th>Return</th></tr></thead>
                            <tbody>
                                {analysisData.trading_periods.map((period, index) => (
                                    <tr key={index}><td>{period.period}</td><td>{period.start_date} - {period.end_date}</td><td className={period.return > 0 ? 'positive-return' : 'negative-return'}>{(period.return * 100).toFixed(2)}%</td></tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- COMPONENT: ThematicView ---
const ThematicView = ({ filterTerm }) => {
    const [sectors, setSectors] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`${API_BASE_URL}/strategies/thematic`)
            .then(res => res.json())
            .then(data => { setSectors(data); setLoading(false); })
            .catch(() => setLoading(false));
    }, []);

    return (
        <div className="content-area">
            <div className="sector-header-flex">
                <h2>📂 Market Sectors & Thematic Portfolios</h2>
                {filterTerm && <button className="clear-filter-btn" onClick={() => window.location.reload()}>Reset Filter</button>}
            </div>

            <p className="sector-description">Proprietary baskets curated by Foega's Hype Engine, tracking institutional flow and retail sentiment.</p>

            {loading ? <div className="loading-spinner">Analyzing Market Segments...</div> : (
                <div className="sectors-grid">
                    {Object.entries(sectors).map(([name, stocks]) => {
                        const isMatch = filterTerm && name.toLowerCase().includes(filterTerm.toLowerCase());
                        return (
                            <div key={name} className={`sector-block ${isMatch ? 'highlight-sector' : ''}`}>
                                <div className="sector-info">
                                    <h4>{name}</h4>
                                    <span className="stock-count">{stocks.length} Assets</span>
                                </div>
                                <div className="mini-ticker-grid">
                                    {stocks.map(s => (
                                        <div key={s.symbol} className="mini-card">
                                            <div className="mini-main">
                                                <span className="mini-symbol">{s.symbol}</span>
                                                <span className="mini-price">${s.price}</span>
                                            </div>
                                            {/* Randomized change for visual "Pro" feel - Replace with real data if available */}
                                            <span className={`mini-change ${(s.price % 2 === 0) ? 'up' : 'down'}`}>
                                                {(s.price % 2 === 0) ? '+' : '-'}{(s.price * 0.01).toFixed(2)}%
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
// --- COMPONENT: TickerDetailModal ---
const TickerDetailModal = ({ modalData, modalLoading, modalError, setModalData, setModalError }) => {
    if (!modalData && !modalError && !modalLoading) return null;
    const closeModal = () => { setModalData(null); setModalError(null); };
    return (
        <div className="modal-overlay" onClick={closeModal}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <button className="modal-close-button" onClick={closeModal}>X</button>
                {modalLoading && <h2>Loading details...</h2>}
                {modalData && (
                    <>
                        <h2 className="modal-ticker">{modalData.ticker}</h2>
                        <p className="modal-price">Current Price: **${modalData.price ? modalData.price.toFixed(2) : 'N/A'}**</p>
                        <div className="modal-stats">
                            <div className="stat-item"><span className="stat-label">Market Cap:</span> <span className="stat-value">{modalData.marketCap ? (modalData.marketCap / 1e9).toFixed(2) + ' B' : 'N/A'}</span></div>
                            <div className="stat-item"><span className="stat-label">Sector:</span> <span className="stat-value">{modalData.sector || 'N/A'}</span></div>
                        </div>
                        <p className="modal-summary-title">Business Summary:</p>
                        <p className="modal-summary-text">{modalData.summary || 'No summary available.'}</p>
                    </>
                )}
            </div>
        </div>
    );
};

// --- MAIN APP COMPONENT ---
export default function App() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [currentView, setCurrentView] = useState('landing');
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showGuide, setShowGuide] = useState(false);
    const [modalData, setModalData] = useState(null);
    const [modalLoading, setModalLoading] = useState(false);
    const [modalError, setModalError] = useState(null);
    const [sectorFilter, setSectorFilter] = useState("");

    useEffect(() => {
        fetch(`${API_BASE_URL}/trending/cached_hype`)
            .then(res => res.json())
            .then(res => { if (res.error) throw new Error(res.error); setData(res); })
            .catch(() => setError("Failed to load data from backend."))
            .finally(() => setLoading(false));
    }, []);

    const fetchTickerDetails = async (ticker) => {
        setModalLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/stock/${ticker}`);
            const result = await res.json();
            setModalData(result);
        } catch (e) { setModalError(e.message); }
        finally { setModalLoading(false); }
    };

    const renderContent = () => {
        switch (currentView) {
            case 'landing':
                return (
                    <div className="content-area landing-page">
                        <h1 className="landing-title">Welcome to Foega Hype Metrics</h1>
                        <p className="landing-tagline">The fastest way to measure retail momentum and identify emerging trends before the masses.</p>
                        <p>Our proprietary Hype Score uses advanced text analysis and Z-score normalization to help you identify assets currently gaining, or losing, significant market attention relative to their peers.</p>
                        <button className="main-cta landing-button" onClick={() => setCurrentView('dashboard')}>View Live Hype Dashboard <FaChartLine /></button>
                        <p className="landing-footer">Log in for Premium Walk-Forward Trader Bot Analysis.</p>
                    </div>
                );
            case 'dashboard':
                return (
                    <div className="content-area dashboard-page">
                        <div className="header-wrapper">
                            <h1 className="main-brand-title">Foega</h1>
                            <p className="main-brand-tagline">Data-Driven Attention Scoring for Modern Assets</p>
                            <button className="guide-toggle-button" onClick={() => setShowGuide(!showGuide)}>{showGuide ? 'Hide' : 'Show'} Guide: What do these scores mean?</button>
                        </div>
                        {showGuide && (
                            <div className="user-guide">
                                <h3>Understanding the Scores</h3>
                                <ul>
                                    <li><strong>Hype Score (70% Social, 30% News):</strong> A normalized volatility metric. Scores **above 1.0** indicate higher-than-average hype.</li>
                                    <li><strong>Social Raw:</strong> Sentiment polarity (-1.0 to 1.0) from recent news.</li>
                                    <li><strong>News Raw:</strong> Count of relevant news articles in the last 7 days.</li>
                                </ul>
                            </div>
                        )}
                        {loading ? <h3 className="loading-message">Loading Cached Data...</h3> : (
                            <div className="data-list">
                               {data && data.length > 0 ? (
    data.map((item, index) => (
        <div key={item.ticker || index} className={getHypeClass(item.hype_score)} onClick={() => fetchTickerDetails(item.ticker)}>
            <h2>{index + 1}. {item.ticker}</h2>
            {/* Using nullish coalescing (??) prevents crashes if a specific ticker has missing data */}
            <p className="hype-score">Hype Score: **{(item.hype_score ?? 0).toFixed(2)}**</p>
            <p>Social Raw: {(item.social_raw ?? 0).toFixed(4)}</p>
            <p>News Raw: {item.news_raw ?? 0}</p>
        </div>
    ))
) : (
    <div className="no-data-notice" style={{ padding: '40px', textAlign: 'center', background: '#1a1a1a', borderRadius: '12px', marginTop: '20px' }}>
        <h3 style={{ color: '#ffcc00' }}>No Data Found in Database</h3>
        <p>Your Supabase table is currently empty.</p>
        <p>To fix this, open a new browser tab and visit:</p>
        <code style={{ background: '#000', padding: '5px 10px', borderRadius: '4px', color: '#00ff00' }}>
            http://127.0.0.1:8000/trending/hype
        </code>
        <p style={{ fontSize: '0.8em', marginTop: '10px', color: '#888' }}>
            (Wait about 30 seconds for the fetch to complete, then refresh this page.)
        </p>
    </div>
)}
                            </div>
                        )}
                        <footer className="dashboard-footer">Data served from FastAPI backend and cached for 5 minutes. Displaying {data.length} results.</footer>
                    </div>
                );
            case 'thematic':
                return <ThematicView filterTerm={sectorFilter} />; // Pass the filter here
            case 'modeler':
                return <GrowthModeler setCurrentView={setCurrentView} setSectorFilter={setSectorFilter} />;
            case 'premium': return <PremiumAnalysisView data={data} />;
            default: return null;
        }
    };

    return (
        <div className={`App ${currentView === 'landing' ? 'landing' : ''}`}>
            {currentView !== 'landing' && (
                <div className={`sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
                    <div className="logo-container">
                        <span className="sidebar-logo">Foega</span>
                        {/* This button only handles closing */}
                        <button className="toggle-btn" onClick={() => setIsSidebarOpen(false)}>
                            <FaBars />
                        </button>
                    </div>
                    <nav className="nav-menu">
                        <div className={`nav-item ${currentView === 'dashboard' ? 'active' : ''}`} onClick={() => setCurrentView('dashboard')}><FaChartLine /> <span>Dashboard</span></div>
                        <div className={`nav-item ${currentView === 'premium' ? 'active' : ''}`} onClick={() => setCurrentView('premium')}><FaLock /> <span>Premium Access</span></div>
                        <div className={`nav-item ${currentView === 'thematic' ? 'active' : ''}`} onClick={() => setCurrentView('thematic')}><FaLayerGroup /> <span>Stock Sectors</span></div>
                        <div className={`nav-item ${currentView === 'modeler' ? 'active' : ''}`} onClick={() => setCurrentView('modeler')}><FaCalculator /> <span>Growth Modeler</span></div>
                    </nav>
                    <div className="hype-indicator"><FaFire /> <span>Hype Engine Online</span></div>
                </div>
            )}

            <div className={`main-content ${currentView === 'landing' ? 'landing' : isSidebarOpen ? 'shifted' : 'full'}`}>
                {/* This button only handles opening and only exists when sidebar is closed */}
                {currentView !== 'landing' && !isSidebarOpen && (
                    <button className="toggle-btn-top" onClick={() => setIsSidebarOpen(true)}>
                        <FaBars />
                    </button>
                )}
                {renderContent()}
            </div>

            <TickerDetailModal modalData={modalData} modalLoading={modalLoading} modalError={modalError} setModalData={setModalData} setModalError={setModalError} />
        </div>
    );
}
