import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

// Barker (https://barker.money) serves stablecoin yield data, routing and
// non-custodial execution quotes to AI agents over MCP (mcp.barker.money),
// priced per call via the x402 payment protocol ($0.001–$0.05 per tool call).
// Agents settle in stablecoins through the OKX, Coinbase CDP and Circle
// facilitators to Barker's dedicated payment wallet. The wallet receives
// nothing but these call payments, so stablecoins arriving there are the
// protocol's realized fees.
const PAY_TO = "0x83f15f5bea445109e255ab82622fbdfecd1e4c9f";

// 6-decimal stablecoin accepted on each chain + CoinGecko id for
// deterministic $1 pricing (USDT0 on X Layer isn't reliably auto-priced).
const TOKENS: Record<string, { token: string; cg: string }> = {
  [CHAIN.XLAYER]: { token: "0x779ded0c9e1022225f8e0630b35a9b54be713736", cg: "tether" }, // USDT0
  [CHAIN.BASE]: { token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", cg: "usd-coin" },
  [CHAIN.ETHEREUM]: { token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", cg: "usd-coin" },
  [CHAIN.POLYGON]: { token: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", cg: "usd-coin" },
  [CHAIN.ARBITRUM]: { token: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", cg: "usd-coin" },
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { token, cg } = TOKENS[options.chain];
  // skipIndexer: X Layer isn't covered by the indexer; logs are cheap at this volume.
  const received = await addTokensReceived({ options, tokens: [token], targets: [PAY_TO], skipIndexer: true });
  const raw = Object.values(received.getBalances()).reduce((sum: number, v: any) => sum + Number(v), 0);
  const dailyFees = options.createBalances();
  dailyFees.addCGToken(cg, raw / 1e6, "x402 Call Fees");
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.XLAYER, CHAIN.BASE, CHAIN.ETHEREUM, CHAIN.POLYGON, CHAIN.ARBITRUM],
  start: "2026-05-20",
  methodology: {
    Fees: "x402 pay-per-call fees paid by AI agents for Barker's MCP stablecoin-yield tools ($0.001–$0.05 per call), settled onchain in stablecoins to the protocol payment wallet.",
    Revenue: "All call fees are kept by the protocol.",
    ProtocolRevenue: "All call fees go to the protocol.",
  },
  breakdownMethodology: {
    Fees: { "x402 Call Fees": "Per-call x402 payments by AI agents for MCP yield data, routing and execution-quote tools." },
    Revenue: { "x402 Call Fees": "All call fees are kept by the protocol." },
    ProtocolRevenue: { "x402 Call Fees": "All call fees go to the protocol." },
  },
};

export default adapter;
