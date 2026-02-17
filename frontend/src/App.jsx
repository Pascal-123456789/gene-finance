import React, { useState, useEffect } from 'react';
import './App.css';
import { FaFire, FaLock, FaBars, FaRocket, FaStar, FaTh } from 'react-icons/fa';
import MarketScanner from './MarketScanner';
import PredictedMovers from './PredictedMovers';
import WatchlistView from './WatchlistView';
import HeatmapView from './HeatmapView';

// --- COMPONENT: HelpModal ---
const HelpModal = ({ onClose }) => (
    <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content help-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={onClose}>&times;</button>
            <h2>How Foega Works</h2>
            <p className="help-intro">
                Foega scans 50 stocks every hour for unusual activity that might signal a big move is coming.
                We combine three independent signals into one score so you can spot opportunities fast.
            </p>

            <div className="help-section">
                <h3>Alert Levels</h3>
                <ul className="help-list">
                    <li><span className="help-badge help-critical">CRITICAL</span> Score 7+. Multiple signals firing hard — something big might be brewing.</li>
                    <li><span className="help-badge help-high">HIGH</span> Score 5-7. Strong unusual activity detected across signals.</li>
                    <li><span className="help-badge help-medium">MEDIUM</span> Score 3-5. Some unusual activity worth keeping an eye on.</li>
                    <li><span className="help-badge help-low">LOW</span> Score 0-3. Normal market behavior, nothing unusual.</li>
                </ul>
            </div>

            <div className="help-section">
                <h3>The Three Signals</h3>
                <ul className="help-list">
                    <li><strong>Options Flow (40%)</strong> — Tracks unusual call option buying vs puts. When big players buy lots of calls, it often means smart money is betting on a move up.</li>
                    <li><strong>Volume Spike (35%)</strong> — Compares today's trading volume to the 30-day average. A sudden spike means way more people are trading than normal.</li>
                    <li><strong>Social Buzz (25%)</strong> — Monitors Reddit and WallStreetBets for mention spikes. When a ticker starts trending, the retail crowd is piling in.</li>
                </ul>
                <p className="help-note">Each signal is scored 0-10. The combined alert score is a weighted average: 40% options + 35% volume + 25% social.</p>
            </div>

            <div className="help-section">
                <h3>Predicted Movers</h3>
                <ul className="help-list">
                    <li><strong>BREAKOUT</strong> — Mover score 4.0+. High probability of a significant price move based on our signals + momentum.</li>
                    <li><strong>WATCH</strong> — Mover score 2.0-4.0. Building momentum, worth watching closely.</li>
                    <li><strong>NEUTRAL</strong> — Below 2.0. No strong signals right now.</li>
                </ul>
            </div>

            <div className="help-section">
                <h3>Heatmap</h3>
                <p>Tile size = our signal strength (bigger tile = stronger Foega signal). Border color = alert level (red = CRITICAL, orange = HIGH). Price change is shown as secondary info inside each tile.</p>
            </div>

            <div className="help-section">
                <h3>Polymarket Badges</h3>
                <p>The purple badges show prediction market odds from Polymarket. The % represents how likely the market thinks a macro event (like a rate cut or regulation change) will happen — and that event could impact the stock.</p>
            </div>

            <div className="help-disclaimer">
                This is not financial advice — use this as one data point among many. Always do your own research before making any trades.
            </div>
        </div>
    </div>
);

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

// --- COMPONENT: PremiumComingSoon ---
const PremiumComingSoon = () => (
    <div className="content-area premium-page">
        <h2>Premium Analysis</h2>
        <div className="coming-soon-card">
            <FaLock size={48} color="#444" />
            <h3>Coming Soon</h3>
            <p>Walk-forward backtesting, optimal strategy parameters, and AI-driven trade signals are under development.</p>
        </div>
    </div>
);

// --- COMPONENT: TickerDetailModal ---
const TickerDetailModal = ({ modalData, modalLoading, modalError, setModalData, setModalError, polymarketEvents }) => {
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

                        {(() => {
                            const events = (polymarketEvents || []).filter(
                                e => e.affected_tickers && e.affected_tickers.includes(modalData.ticker)
                            );
                            if (events.length === 0) return null;
                            return (
                                <div className="polymarket-modal-section">
                                    <h3>Prediction Markets</h3>
                                    {events.map((evt, i) => (
                                        <div key={i} className="polymarket-modal-event">
                                            <p className="polymarket-modal-question">{evt.question}</p>
                                            <div className="polymarket-modal-bar-wrapper">
                                                <div className="polymarket-modal-bar">
                                                    <div
                                                        className="polymarket-modal-bar-fill"
                                                        style={{ width: `${Math.round(evt.probability * 100)}%` }}
                                                    />
                                                </div>
                                                <span className="polymarket-modal-pct">
                                                    {Math.round(evt.probability * 100)}%
                                                </span>
                                            </div>
                                            <div className="polymarket-modal-meta">
                                                <span>24h Vol: ${evt.volume_24h ? evt.volume_24h.toLocaleString() : '0'}</span>
                                                {evt.end_date && (
                                                    <span>Ends: {new Date(evt.end_date).toLocaleDateString()}</span>
                                                )}
                                                {evt.slug && (
                                                    <a
                                                        href={`https://polymarket.com/event/${evt.slug}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="polymarket-modal-link"
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
    const [modalData, setModalData] = useState(null);
    const [modalLoading, setModalLoading] = useState(false);
    const [modalError, setModalError] = useState(null);
    const [polymarketEvents, setPolymarketEvents] = useState([]);
    const [showHelp, setShowHelp] = useState(false);

    // Fetch Polymarket events
    useEffect(() => {
        fetch(`${API_BASE_URL}/polymarket/events`)
            .then(res => res.json())
            .then(events => { if (Array.isArray(events)) setPolymarketEvents(events); })
            .catch(err => console.error('Polymarket fetch error:', err));
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

                        <div className="how-it-works">
                            <h2 className="how-it-works-title">How It Works</h2>
                            <div className="how-it-works-steps">
                                <div className="step-card">
                                    <span className="step-number">1</span>
                                    <p>We scan 50 stocks every hour for unusual options flow, volume spikes & social buzz</p>
                                </div>
                                <div className="step-card">
                                    <span className="step-number">2</span>
                                    <p>Our algorithm scores each signal 0-10 and combines them into an alert score</p>
                                </div>
                                <div className="step-card">
                                    <span className="step-number">3</span>
                                    <p>Stocks hitting HIGH or CRITICAL deserve a closer look — act on your own research</p>
                                </div>
                            </div>
                        </div>

                        <p className="landing-footer">Professional tools for active traders and investors</p>
                    </div>
                );
            case 'dashboard':
                return <MarketScanner />;
            case 'movers':
                return <PredictedMovers />;
            case 'watchlist':
                return <WatchlistView />;
            case 'heatmap':
                return <HeatmapView onTickerClick={fetchTickerDetails} />;
            case 'premium':
                return <PremiumComingSoon />;
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
                        <div className={`nav-item ${currentView === 'movers' ? 'active' : ''}`}
                             onClick={() => setCurrentView('movers')}>
                            <FaRocket /> <span>Predicted Movers</span>
                        </div>
                        <div className={`nav-item ${currentView === 'heatmap' ? 'active' : ''}`}
                             onClick={() => setCurrentView('heatmap')}>
                            <FaTh /> <span>Heatmap</span>
                        </div>
                        <div className={`nav-item ${currentView === 'watchlist' ? 'active' : ''}`}
                             onClick={() => setCurrentView('watchlist')}>
                            <FaStar /> <span>Watchlist</span>
                        </div>
                        <div className={`nav-item ${currentView === 'premium' ? 'active' : ''}`}
                             onClick={() => setCurrentView('premium')}>
                            <FaLock /> <span>Premium Access</span>
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
                polymarketEvents={polymarketEvents}
            />

            <button className="help-fab" onClick={() => setShowHelp(true)} title="How it works">
                ?
            </button>

            {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
        </div>
    );
}
