import React, { useState, useEffect } from 'react';
import './App.css';
import { FaFire, FaChartLine, FaLock, FaBars, FaCalculator, FaLayerGroup } from 'react-icons/fa';
import MarketScanner from './MarketScanner';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

// --- HELPER FUNCTIONS ---
const getHypeClass = (score) => {
    if (score > 1.0) return 'ticker-card hype-positive-strong';
    if (score > 0.3) return 'ticker-card hype-positive';
    if (score < -1.0) return 'ticker-card hype-negative-strong';
    if (score < -0.3) return 'ticker-card hype-negative';
    return 'ticker-card hype-neutral';
};

// --- COMPONENT: GrowthModeler ---
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
                        <h4>Performance Metrics</h4>
                        <div className="param-grid">
                            {Object.entries(analysisData.performance_metrics).map(([key, value]) => (
                                <div key={key} className="param-item"><span className="param-label">{key}:</span> <span className="param-value">{value}</span></div>
                            ))}
                        </div>
                    </div>
                    <div className="analysis-section">
                        <h4>Walk-Forward Trading Periods</h4>
                        <div className="trading-periods">
                            {analysisData.trading_periods.map((period, index) => (
                                <div key={index} className="period-card">
                                    <strong>{period.period}</strong>: {period.start_date} → {period.end_date} <br />
                                    <span className={period.return >= 0 ? 'positive-return' : 'negative-return'}>
                                        Return: {(period.return * 100).toFixed(2)}%
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            {error && <p className="error-message">Error: {error}</p>}
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
            .catch(err => { console.error(err); setLoading(false); });
    }, []);

    if (loading) return <div className="content-area"><h3 className="loading-message">Loading sector data...</h3></div>;

    const filteredSectors = filterTerm
        ? { [filterTerm]: sectors[filterTerm] }
        : sectors;

    return (
        <div className="content-area thematic-page">
            <h1 className="main-brand-title">📊 Stock Sectors</h1>
            <p className="main-brand-tagline">Thematic investment strategies by sector</p>
            {Object.keys(filteredSectors).length === 0 && <p>No sectors available.</p>}
            {Object.entries(filteredSectors).map(([sectorName, stocks]) => (
                <div key={sectorName} className="sector-group">
                    <h2 className="sector-title">{sectorName}</h2>
                    <div className="sector-stocks">
                        {stocks.map(stock => (
                            <div key={stock.symbol} className="stock-card">
                                <span className="stock-symbol">{stock.symbol}</span>
                                <span className="stock-price">${stock.price.toFixed(2)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};

// --- COMPONENT: TickerDetailModal ---
const TickerDetailModal = ({ modalData, modalLoading, modalError, setModalData, setModalError }) => {
    if (!modalData && !modalLoading && !modalError) return null;

    return (
        <div className="modal-overlay" onClick={() => { setModalData(null); setModalError(null); }}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <button className="modal-close-btn" onClick={() => { setModalData(null); setModalError(null); }}>×</button>
                {modalLoading && <h3>Loading ticker details...</h3>}
                {modalError && <p className="error-message">Error: {modalError}</p>}
                {modalData && (
                    <>
                        <h2>{modalData.ticker}</h2>
                        <div className="modal-stats-grid">
                            <div className="stat-item"><span className="stat-label">Price:</span> <span className="stat-value">${modalData.price || 'N/A'}</span></div>
                            <div className="stat-item"><span className="stat-label">Market Cap:</span> <span className="stat-value">${(modalData.marketCap / 1e9).toFixed(2)}B</span></div>
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
    const [modalData, setModalData] = useState(null);
    const [modalLoading, setModalLoading] = useState(false);
    const [modalError, setModalError] = useState(null);
    const [sectorFilter, setSectorFilter] = useState("");

    // Fetch data for Premium Analysis (still uses old endpoint for now)
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
                        <h1 className="landing-title">Welcome to Foega Market Scanner</h1>
                        <p className="landing-tagline">Real-time market activity monitoring with options flow, volume analysis & sentiment tracking</p>
                        <p>Our unified platform combines institutional-grade signals to detect unusual market activity before it trends.</p>
                        <button className="main-cta landing-button" onClick={() => setCurrentView('dashboard')}>
                            View Live Market Scanner <FaFire />
                        </button>
                        <p className="landing-footer">Professional tools for active traders and investors</p>
                    </div>
                );
            case 'dashboard':
                return <MarketScanner />;
            case 'thematic':
                return <ThematicView filterTerm={sectorFilter} />;
            case 'modeler':
                return <GrowthModeler setCurrentView={setCurrentView} setSectorFilter={setSectorFilter} />;
            case 'premium':
                return <PremiumAnalysisView data={data} />;
            default:
                return null;
        }
    };

    return (
        <div className={`App ${currentView === 'landing' ? 'landing' : ''}`}>
            {currentView !== 'landing' && (
                <div className={`sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
                    <div className="logo-container">
                        <span className="sidebar-logo">Foega</span>
                        <button className="toggle-btn" onClick={() => setIsSidebarOpen(false)}>
                            <FaBars />
                        </button>
                    </div>
                    <nav className="nav-menu">
                        <div className={`nav-item ${currentView === 'dashboard' ? 'active' : ''}`}
                             onClick={() => setCurrentView('dashboard')}>
                            <FaFire /> <span>Market Scanner</span>
                        </div>
                        <div className={`nav-item ${currentView === 'premium' ? 'active' : ''}`}
                             onClick={() => setCurrentView('premium')}>
                            <FaLock /> <span>Premium Access</span>
                        </div>
                        <div className={`nav-item ${currentView === 'thematic' ? 'active' : ''}`}
                             onClick={() => setCurrentView('thematic')}>
                            <FaLayerGroup /> <span>Stock Sectors</span>
                        </div>
                        <div className={`nav-item ${currentView === 'modeler' ? 'active' : ''}`}
                             onClick={() => setCurrentView('modeler')}>
                            <FaCalculator /> <span>Growth Modeler</span>
                        </div>
                    </nav>
                    <div className="hype-indicator"><FaFire /> <span>Scanner Online</span></div>
                </div>
            )}

            <div className={`main-content ${currentView === 'landing' ? 'landing' : isSidebarOpen ? 'shifted' : 'full'}`}>
                {currentView !== 'landing' && !isSidebarOpen && (
                    <button className="toggle-btn-top" onClick={() => setIsSidebarOpen(true)}>
                        <FaBars />
                    </button>
                )}
                {renderContent()}
            </div>

            <TickerDetailModal
                modalData={modalData}
                modalLoading={modalLoading}
                modalError={modalError}
                setModalData={setModalData}
                setModalError={setModalError}
            />
        </div>
    );
}
