// lib/stocks.ts
export type Stock = {
  symbol: string;
  name: string;
  domain?: string; // used for Clearbit fallback
  icon: {
    primary: string;
    fallback?: string;
  };
};

export const STOCKS: ReadonlyArray<Stock> = [
  { symbol: "AAPL", name: "Apple", domain: "apple.com", icon: { primary: "logos:apple", fallback: "simple-icons:apple" } },
  { symbol: "MSFT", name: "Microsoft", domain: "microsoft.com", icon: { primary: "logos:microsoft-icon", fallback: "simple-icons:microsoft" } },
  { symbol: "GOOGL", name: "Alphabet (Class A)", domain: "google.com", icon: { primary: "logos:google-icon", fallback: "simple-icons:google" } },

  { symbol: "AMZN", name: "Amazon", domain: "amazon.com", icon: { primary: "simple-icons:amazon" } },
  { symbol: "NVDA", name: "NVIDIA", domain: "nvidia.com", icon: { primary: "logos:nvidia", fallback: "simple-icons:nvidia" } },
  { symbol: "META", name: "Meta Platforms", domain: "meta.com", icon: { primary: "logos:meta-icon", fallback: "simple-icons:meta" } },
  { symbol: "TSLA", name: "Tesla", domain: "tesla.com", icon: { primary: "simple-icons:tesla" } },

  // These often don’t have nice “logos:*” icons — simple-icons + clearbit will handle it.
  { symbol: "BRK.B", name: "Berkshire Hathaway (Class B)", domain: "berkshirehathaway.com", icon: { primary: "simple-icons:berkshirehathaway" } },
  { symbol: "JPM", name: "JPMorgan Chase", domain: "jpmorganchase.com", icon: { primary: "simple-icons:jpmorganchase" } },
  { symbol: "V", name: "Visa", domain: "visa.com", icon: { primary: "logos:visa", fallback: "simple-icons:visa" } },

  { symbol: "JNJ", name: "Johnson & Johnson", domain: "jnj.com", icon: { primary: "simple-icons:johnsonjohnson" } },
  { symbol: "WMT", name: "Walmart", domain: "walmart.com", icon: { primary: "logos:walmart", fallback: "simple-icons:walmart" } },
  { symbol: "PG", name: "Procter & Gamble", domain: "pg.com", icon: { primary: "simple-icons:proctergamble" } },
  { symbol: "KO", name: "Coca-Cola", domain: "coca-colacompany.com", icon: { primary: "simple-icons:cocacola" } },
  { symbol: "PEP", name: "PepsiCo", domain: "pepsico.com", icon: { primary: "simple-icons:pepsi" } },
  { symbol: "DIS", name: "Disney", domain: "thewaltdisneycompany.com", icon: { primary: "logos:disney", fallback: "simple-icons:disney" } },

  { symbol: "INTC", name: "Intel", domain: "intel.com", icon: { primary: "logos:intel", fallback: "simple-icons:intel" } },
  { symbol: "NFLX", name: "Netflix", domain: "netflix.com", icon: { primary: "logos:netflix", fallback: "simple-icons:netflix" } },
  { symbol: "CSCO", name: "Cisco", domain: "cisco.com", icon: { primary: "logos:cisco", fallback: "simple-icons:cisco" } },
  { symbol: "IBM", name: "IBM", domain: "ibm.com", icon: { primary: "logos:ibm", fallback: "simple-icons:ibm" } },
  { symbol: "COST", name: "Costco", domain: "costco.com", icon: { primary: "simple-icons:costco" } },
];

