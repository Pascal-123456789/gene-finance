// Shared ticker metadata: company name, sector, and market cap category
// Sectors match HeatmapView.jsx SECTOR_MAP groupings

const TICKER_DATA = {
  // Tech
  AAPL:  { name: "Apple",          sector: "Tech",           cap: "Large Cap" },
  MSFT:  { name: "Microsoft",      sector: "Tech",           cap: "Large Cap" },
  GOOGL: { name: "Alphabet",       sector: "Tech",           cap: "Large Cap" },
  AMZN:  { name: "Amazon",         sector: "Tech",           cap: "Large Cap" },
  META:  { name: "Meta",           sector: "Tech",           cap: "Large Cap" },
  NVDA:  { name: "Nvidia",         sector: "Tech",           cap: "Large Cap" },
  TSLA:  { name: "Tesla",          sector: "Tech",           cap: "Large Cap" },
  NFLX:  { name: "Netflix",        sector: "Tech",           cap: "Large Cap" },

  // Semiconductors
  AMD:   { name: "AMD",            sector: "Semiconductors", cap: "Large Cap" },
  INTC:  { name: "Intel",          sector: "Semiconductors", cap: "Large Cap" },
  AVGO:  { name: "Broadcom",       sector: "Semiconductors", cap: "Large Cap" },
  QCOM:  { name: "Qualcomm",       sector: "Semiconductors", cap: "Large Cap" },
  TSM:   { name: "TSMC",           sector: "Semiconductors", cap: "Large Cap" },
  MU:    { name: "Micron",         sector: "Semiconductors", cap: "Large Cap" },

  // Fintech
  V:     { name: "Visa",           sector: "Fintech",        cap: "Large Cap" },
  MA:    { name: "Mastercard",     sector: "Fintech",        cap: "Large Cap" },
  PYPL:  { name: "PayPal",         sector: "Fintech",        cap: "Large Cap" },
  COIN:  { name: "Coinbase",       sector: "Fintech",        cap: "Mid Cap" },
  HOOD:  { name: "Robinhood",      sector: "Fintech",        cap: "Mid Cap" },
  SOFI:  { name: "SoFi",           sector: "Fintech",        cap: "Mid Cap" },

  // Meme & Social
  GME:   { name: "GameStop",       sector: "Meme & Social",  cap: "Mid Cap" },
  AMC:   { name: "AMC",            sector: "Meme & Social",  cap: "Small Cap" },
  PLTR:  { name: "Palantir",       sector: "Meme & Social",  cap: "Large Cap" },
  SNAP:  { name: "Snap",           sector: "Meme & Social",  cap: "Mid Cap" },
  RBLX:  { name: "Roblox",         sector: "Meme & Social",  cap: "Mid Cap" },

  // Growth
  UBER:  { name: "Uber",           sector: "Growth",         cap: "Large Cap" },
  LYFT:  { name: "Lyft",           sector: "Growth",         cap: "Mid Cap" },
  ABNB:  { name: "Airbnb",         sector: "Growth",         cap: "Large Cap" },
  DASH:  { name: "DoorDash",       sector: "Growth",         cap: "Large Cap" },
  SPOT:  { name: "Spotify",        sector: "Growth",         cap: "Large Cap" },
  ZM:    { name: "Zoom",           sector: "Growth",         cap: "Mid Cap" },

  // Finance
  JPM:   { name: "JPMorgan",       sector: "Finance",        cap: "Large Cap" },
  BAC:   { name: "Bank of America",sector: "Finance",        cap: "Large Cap" },
  GS:    { name: "Goldman Sachs",  sector: "Finance",        cap: "Large Cap" },
  MS:    { name: "Morgan Stanley", sector: "Finance",        cap: "Large Cap" },
  WFC:   { name: "Wells Fargo",    sector: "Finance",        cap: "Large Cap" },

  // Healthcare
  JNJ:   { name: "Johnson & Johnson", sector: "Healthcare",  cap: "Large Cap" },
  UNH:   { name: "UnitedHealth",   sector: "Healthcare",     cap: "Large Cap" },
  PFE:   { name: "Pfizer",         sector: "Healthcare",     cap: "Large Cap" },
  ABBV:  { name: "AbbVie",         sector: "Healthcare",     cap: "Large Cap" },
  LLY:   { name: "Eli Lilly",      sector: "Healthcare",     cap: "Large Cap" },

  // Energy
  XOM:   { name: "Exxon Mobil",    sector: "Energy",         cap: "Large Cap" },
  CVX:   { name: "Chevron",        sector: "Energy",         cap: "Large Cap" },
  COP:   { name: "ConocoPhillips", sector: "Energy",         cap: "Large Cap" },
  SLB:   { name: "SLB",            sector: "Energy",         cap: "Large Cap" },

  // Consumer
  WMT:   { name: "Walmart",        sector: "Consumer",       cap: "Large Cap" },
  HD:    { name: "Home Depot",     sector: "Consumer",       cap: "Large Cap" },
  NKE:   { name: "Nike",           sector: "Consumer",       cap: "Large Cap" },
  MCD:   { name: "McDonald's",     sector: "Consumer",       cap: "Large Cap" },
};

export default TICKER_DATA;
