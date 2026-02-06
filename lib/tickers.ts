export type Ticker = {
  symbol: string;
  name: string;
};

export const TICKERS: ReadonlyArray<Ticker> = [
  { symbol: "AAPL", name: "Apple" },
  { symbol: "MSFT", name: "Microsoft" },
  { symbol: "GOOGL", name: "Alphabet (Class A)" },
  { symbol: "AMZN", name: "Amazon" },
  { symbol: "NVDA", name: "NVIDIA" },
  { symbol: "META", name: "Meta Platforms" },
  { symbol: "TSLA", name: "Tesla" },
  { symbol: "BRK.B", name: "Berkshire Hathaway (Class B)" },
  { symbol: "JPM", name: "JPMorgan Chase" },
  { symbol: "V", name: "Visa" },
  { symbol: "JNJ", name: "Johnson & Johnson" },
  { symbol: "WMT", name: "Walmart" },
  { symbol: "PG", name: "Procter & Gamble" },
  { symbol: "KO", name: "Coca-Cola" },
  { symbol: "PEP", name: "PepsiCo" },
  { symbol: "DIS", name: "Disney" },
  { symbol: "INTC", name: "Intel" },
  { symbol: "NFLX", name: "Netflix" },
  { symbol: "CSCO", name: "Cisco" },
  { symbol: "IBM", name: "IBM" },
  { symbol: "COST", name: "Costco" },
];
