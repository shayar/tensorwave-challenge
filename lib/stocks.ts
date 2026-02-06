export type Stock = {
  symbol: string;
  name: string;
  domain: string; // used for logo
};

export const STOCKS: ReadonlyArray<Stock> = [
  { symbol: "AAPL",  name: "Apple",                       domain: "apple.com" },
  { symbol: "MSFT",  name: "Microsoft",                   domain: "microsoft.com" },
  { symbol: "GOOGL", name: "Alphabet (Class A)",          domain: "abc.xyz" },                 // :contentReference[oaicite:1]{index=1}
  { symbol: "AMZN",  name: "Amazon",                      domain: "amazon.com" },
  { symbol: "NVDA",  name: "NVIDIA",                      domain: "nvidia.com" },
  { symbol: "META",  name: "Meta Platforms",              domain: "meta.com" },
  { symbol: "TSLA",  name: "Tesla",                       domain: "tesla.com" },
  { symbol: "BRK.B", name: "Berkshire Hathaway (Class B)",domain: "berkshirehathaway.com" },  // :contentReference[oaicite:2]{index=2}
  { symbol: "JPM",   name: "JPMorgan Chase",              domain: "jpmorganchase.com" },
  { symbol: "V",     name: "Visa",                        domain: "visa.com" },
  { symbol: "JNJ",   name: "Johnson & Johnson",           domain: "jnj.com" },                 // :contentReference[oaicite:3]{index=3}
  { symbol: "WMT",   name: "Walmart",                     domain: "walmart.com" },
  { symbol: "PG",    name: "Procter & Gamble",            domain: "us.pg.com" },               // :contentReference[oaicite:4]{index=4}
  { symbol: "KO",    name: "Coca-Cola",                   domain: "coca-cola.com" },
  { symbol: "PEP",   name: "PepsiCo",                     domain: "pepsico.com" },
  { symbol: "DIS",   name: "Disney",                      domain: "thewaltdisneycompany.com" },
  { symbol: "INTC",  name: "Intel",                       domain: "intel.com" },
  { symbol: "NFLX",  name: "Netflix",                     domain: "netflix.com" },
  { symbol: "CSCO",  name: "Cisco",                       domain: "cisco.com" },
  { symbol: "IBM",   name: "IBM",                         domain: "ibm.com" },
  { symbol: "COST",  name: "Costco",                      domain: "costco.com" },
];

export function getStock(symbol: string): Stock | undefined {
  const s = symbol.toUpperCase();
  return STOCKS.find((x) => x.symbol === s);
}
