import React, { useState, useEffect } from 'react';
import './App.css';
import { FiActivity, FiRadio, FiClock, FiBookmark, FiInfo, FiLock, FiMail, FiMenu } from 'react-icons/fi';
import Scanner from './Scanner';
import MarketScanner from './MarketScanner';
import PredictedMovers from './PredictedMovers';
import WatchlistView from './WatchlistView';
import HeatmapView from './HeatmapView';
import AlertHistoryView from './AlertHistoryView';
import NewsIntelligence from './NewsIntelligence';
import PremiumAccess from './PremiumAccess';

// --- COMPONENT: HelpModal ---
const HelpModal = ({ onClose }) => (
    <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content help-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={onClose}>&times;</button>
            <h2>How EarlyBell Works</h2>
            <p className="help-intro">
                EarlyBell scans 50 stocks every hour for unusual activity that might signal a big move is coming.
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
                <p>Tile size = our signal strength (bigger tile = stronger EarlyBell signal). Border color = alert level (red = CRITICAL, orange = HIGH). Price change is shown as secondary info inside each tile.</p>
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
    const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768);
    const isFirstVisit = !localStorage.getItem('earlybell_visited');
    const [currentView, setCurrentView] = useState(isFirstVisit ? 'welcome' : 'scanner');
    const [modalData, setModalData] = useState(null);
    const [modalLoading, setModalLoading] = useState(false);
    const [modalError, setModalError] = useState(null);
    const [polymarketEvents, setPolymarketEvents] = useState([]);
    const [showHelp, setShowHelp] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

    // Auto-close sidebar on resize to mobile
    useEffect(() => {
        const handleResize = () => {
            const mobile = window.innerWidth <= 768;
            setIsMobile(mobile);
            if (mobile) setIsSidebarOpen(false);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

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

    const handleEnterScanner = () => {
        localStorage.setItem('earlybell_visited', 'true');
        setCurrentView('scanner');
    };

    const aboutContent = (
        <div className="content-area landing-page">
            <h1 className="landing-title">EarlyBell Market Scanner</h1>
            <p className="landing-tagline">Track unusual options flow, volume spikes, and social sentiment across 49 US stocks</p>
            <p>Aggregates publicly available market signals into a single dashboard, updated hourly.</p>

            <div className="how-it-works">
                <h2 className="how-it-works-title">How It Works</h2>
                <div className="how-it-works-steps">
                    <div className="step-card">
                        <span className="step-number">1</span>
                        <p>Every hour, we pull options flow, trading volume, and Reddit mention data for 49 tickers</p>
                    </div>
                    <div className="step-card">
                        <span className="step-number">2</span>
                        <p>Each signal is scored 0-10 and combined into a weighted alert score (40% options, 35% volume, 25% social)</p>
                    </div>
                    <div className="step-card">
                        <span className="step-number">3</span>
                        <p>High-scoring tickers may warrant further research — this is a screening tool, not financial advice</p>
                    </div>
                </div>
            </div>

            <div className="about-section">
                <h2 className="about-title">About</h2>
                <p className="about-text">
                    Built by a finance student at the University of Melbourne.
                    Data sourced from yfinance, Finnhub, ApeWisdom, and Polymarket.
                </p>
            </div>
        </div>
    );

    const renderContent = () => {
        switch (currentView) {
            case 'welcome':
                return (
                    <>
                        {aboutContent}
                        <div style={{ textAlign: 'center', marginTop: '10px', marginBottom: '40px' }}>
                            <button className="landing-button" onClick={handleEnterScanner}>
                                Take Me to the Scanner
                            </button>
                        </div>
                    </>
                );
            case 'scanner':
                return <Scanner polymarketEvents={polymarketEvents} onTickerClick={fetchTickerDetails} />;
            case 'news':
                return <NewsIntelligence />;
            case 'history':
                return <AlertHistoryView />;
            case 'watchlist':
                return <WatchlistView />;
            case 'about':
                return aboutContent;
            case 'premium':
                return <PremiumAccess />;
            default:
                return null;
        }
    };

    return (
        <div className="App">
            {currentView !== 'welcome' && (
                <div className={`sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
                    {/* Logo area */}
                    <div className="logo-container">
                        <span className="sb-logo-collapsed">EB</span>
                        <div className="sb-wordmark-wrap">
                            <span className="sb-wordmark">
                                <span className="sb-wordmark-early">Early</span><span className="sb-wordmark-bell">Bell</span>
                            </span>
                            <span className="sb-tagline">Market Intelligence</span>
                        </div>
                        <button className="toggle-btn" onClick={() => setIsSidebarOpen(v => !v)} title="Toggle sidebar">
                            <FiMenu />
                        </button>
                    </div>

                    {/* Navigation */}
                    <nav className="nav-menu">
                        {/* Primary nav */}
                        <div className="nav-group">
                            <div className={`nav-item ${currentView === 'scanner' ? 'active' : ''}`}
                                 onClick={() => setCurrentView('scanner')}>
                                <FiActivity /><span>Scanner</span>
                            </div>
                            <div className={`nav-item ${currentView === 'news' ? 'active' : ''}`}
                                 onClick={() => setCurrentView('news')}>
                                <FiRadio /><span>News Radar</span>
                            </div>
                            <div className={`nav-item ${currentView === 'history' ? 'active' : ''}`}
                                 onClick={() => setCurrentView('history')}>
                                <FiClock /><span>Alert History</span>
                            </div>
                            <div className={`nav-item ${currentView === 'watchlist' ? 'active' : ''}`}
                                 onClick={() => setCurrentView('watchlist')}>
                                <FiBookmark /><span>Watchlist</span>
                            </div>
                        </div>

                        <hr className="nav-group-divider" />

                        {/* Secondary nav */}
                        <div className="nav-group">
                            <div className={`nav-item ${currentView === 'about' ? 'active' : ''}`}
                                 onClick={() => setCurrentView('about')}>
                                <FiInfo /><span>How It Works</span>
                            </div>
                            <div className={`nav-item ${currentView === 'premium' ? 'active' : ''}`}
                                 onClick={() => setCurrentView('premium')}>
                                <FiLock /><span>Premium Access</span>
                            </div>
                            <div className="nav-item"
                                 onClick={() => window.location.href = 'mailto:dipbedford@gmail.com?subject=EarlyBell%20Feedback'}>
                                <FiMail /><span>Feedback</span>
                            </div>
                        </div>
                    </nav>

                    {/* Status bar */}
                    <div className="sb-status">
                        <span className="sb-status-dot" />
                        <span className="sb-status-label">Online</span>
                    </div>
                </div>
            )}

            {currentView !== 'welcome' && isMobile && isSidebarOpen && (
                <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)} />
            )}

            <div className={`main-content ${currentView === 'welcome' ? 'full' : isSidebarOpen ? 'shifted' : 'collapsed'}`}>
                {currentView !== 'welcome' && !isSidebarOpen && (
                    <button className="toggle-btn-top" onClick={() => setIsSidebarOpen(true)}>
                        <FiMenu />
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

            <div className="disclaimer-footer">
                Not financial advice. Use as one data point among many. Always do your own research.
            </div>
        </div>
    );
}
