import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet, httpPost } from "../utils/fetchURL";

// Hypercall matches options off-chain and custodies collateral in its HyperCore account, so its public API is the
// trade source (option tokens are not deployed on HyperEVM). One row per fill, newest first, max 1000 rows per page.
const TRADES_API = "https://api.hypercall.xyz/trades";
const PAGE_SIZE = 1000;
const HOUR_MS = 60 * 60 * 1000;

type HypercallTrade = {
  trade_id: number;
  symbol: string; // UNDERLYING-YYYYMMDD-STRIKE-C|P, e.g. SP500-20260924-7600-P
  price: string; // premium per contract in USD
  size: string; // contracts, one contract = one unit of the underlying
  timestamp: number; // ms
};

type Candle = { t: number; T: number; o: string };

async function getTrades(fromMs: number, toMs: number): Promise<HypercallTrade[]> {
  const trades = new Map<number, HypercallTrade>(); // keyed by trade_id: new fills shift offsets, so pages can overlap
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { success, data } = await httpGet(`${TRADES_API}?limit=${PAGE_SIZE}&offset=${offset}`);
    if (!success || !Array.isArray(data)) throw new Error(`Hypercall trades: bad response at offset ${offset}`);
    for (const trade of data) if (trade.timestamp >= fromMs && trade.timestamp < toMs) trades.set(trade.trade_id, trade);
    if (data.length < PAGE_SIZE || data[data.length - 1].timestamp < fromMs) break;
  }
  return [...trades.values()];
}

// Hypercall underlyings trade as Hyperliquid perps: BTC/ETH on the main dex, equities and indices on trade.xyz (HIP-3)
const hyperliquidCoin = (underlying: string) => (["BTC", "ETH"].includes(underlying) ? underlying : `xyz:${underlying}`);

async function getHourlyCandles(underlying: string, fromMs: number, toMs: number): Promise<Candle[]> {
  const coin = hyperliquidCoin(underlying);
  const candles: Candle[] = await httpPost("https://api.hyperliquid.xyz/info", {
    type: "candleSnapshot",
    req: { coin, interval: "1h", startTime: fromMs - HOUR_MS, endTime: toMs },
  });
  if (!candles?.length) throw new Error(`Hypercall: no Hyperliquid candles for ${coin}`);
  return candles;
}

const fetch = async (options: FetchOptions) => {
  const dailyNotionalVolume = options.createBalances();
  const dailyPremiumVolume = options.createBalances();
  const fromMs = options.startTimestamp * 1000;
  const toMs = options.endTimestamp * 1000;

  const trades = await getTrades(fromMs, toMs);
  const underlyings = [...new Set(trades.map((t) => t.symbol.split("-")[0]))];
  const candles: Record<string, Candle[]> = {};
  for (const underlying of underlyings) candles[underlying] = await getHourlyCandles(underlying, fromMs, toMs);

  for (const trade of trades) {
    const underlying = trade.symbol.split("-")[0];
    const candle = candles[underlying].find((c) => c.t <= trade.timestamp && trade.timestamp <= c.T);
    if (!candle) throw new Error(`Hypercall: no ${underlying} candle for trade ${trade.trade_id}`);
    const size = Number(trade.size);
    dailyNotionalVolume.addUSDValue(size * Number(candle.o));
    dailyPremiumVolume.addUSDValue(size * Number(trade.price));
  }

  return { dailyNotionalVolume, dailyPremiumVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: "2026-06-01", // mainnet launch, first trade 2026-06-01T19:55Z
  methodology: {
    NotionalVolume: "Contracts traded on Hypercall times the underlying price, taken as the open of the Hyperliquid 1h candle (BTC/ETH perps, trade.xyz perps for equities and indices) containing the trade. Each fill is counted once.",
    PremiumVolume: "Contracts traded on Hypercall times the option premium paid. Each fill is counted once.",
  },
};

export default adapter;
