import ADDRESSES from '../helpers/coreAssets.json'
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
  [CHAIN.XLAYER]: { token: ADDRESSES.xlayer.USDT0, cg: "tether" }, // USDT0
  [CHAIN.BASE]: { token: ADDRESSES.base.USDC, cg: "usd-coin" },
  [CHAIN.ETHEREUM]: { token: ADDRESSES.ethereum.USDC, cg: "usd-coin" },
  [CHAIN.POLYGON]: { token: ADDRESSES.polygon.USDC_CIRCLE, cg: "usd-coin" },
  [CHAIN.ARBITRUM]: { token: ADDRESSES.arbitrum.USDC_CIRCLE, cg: "usd-coin" },
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { token } = TOKENS[options.chain];
  const x402Fees = await addTokensReceived({ options, token, target: PAY_TO });
  const dailyFees = options.createBalances();
  dailyFees.add( x402Fees, "x402 Call Fees");
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.XLAYER, CHAIN.BASE, CHAIN.ETHEREUM, CHAIN.POLYGON, CHAIN.ARBITRUM],
  start: "2026-05-20",
  methodology: {
    Fees: "x402 pay-per-call fees paid by AI agents for Barker's MCP stablecoin-yield tools ($0.001–$0.05 per call), settled onchain in stablecoins to the protocol payment wallet.",
    Revenue: "All x402 call fees paid by AI agents are kept by the protocol.",
    ProtocolRevenue: "All x402 call fees paid by AI agents are kept by the protocol.",
  },
  breakdownMethodology: {
    Fees: { "x402 Call Fees": "Per-call x402 payments by AI agents for MCP yield data, routing and execution-quote tools." },
    Revenue: { "x402 Call Fees": "All x402 call fees paid by AI agents are kept by the protocol." },
    ProtocolRevenue: { "x402 Call Fees": "All x402 call fees paid by AI agents are kept by the protocol." },
  },
};

export default adapter;
