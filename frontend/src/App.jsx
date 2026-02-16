import React, { useState, useEffect } from 'react';
import './App.css';
import { FaFire, FaLock, FaBars, FaRocket, FaStar, FaTh } from 'react-icons/fa';
import MarketScanner from './MarketScanner';
import PredictedMovers from './PredictedMovers';
import WatchlistView from './WatchlistView';
import HeatmapView from './HeatmapView';

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
        </div>
    );
}
