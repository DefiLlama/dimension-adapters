import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Perpl Exchange (UUPS proxy) on Monad mainnet
const EXCHANGE = "0x34B6552d57a35a1D042CcAe1951BD1C370112a6F";

// Per-market PNS / LNS decimal scales (from on-chain Perpetual config).
// Notional USD per fill = (pricePNS / PRICE_SCALE) * (lotLNS / SIZE_SCALE).
const PRICE_SCALE: Record<number, number> = {
  1: 10,           // BTC
  10: 1_000_000,   // MON
  20: 100,         // ETH
  30: 100,         // SOL
  40: 10_000,      // HYPE
};
const SIZE_SCALE: Record<number, number> = {
  1: 100_000,      // BTC
  10: 1,           // MON
  20: 1_000,       // ETH
  30: 1_000,       // SOL
  40: 100,         // HYPE
};

const fetch = async ({ getLogs }: FetchOptions) => {
  // MakerOrderFilled fires once per fill on the maker side and carries perpId
  // for per-market scaling. Each match emits exactly one MakerOrderFilled and
  // one TakerOrderFilled with identical notional, so summing the maker side
  // gives one-sided exchange volume (the convention DefiLlama uses).
  const logs = await getLogs({
    target: EXCHANGE,
    eventAbi:
      "event MakerOrderFilled(uint256 perpId, uint256 accountId, uint256 orderId, uint256 pricePNS, uint256 lotLNS, uint256 feeCNS, uint256 lockedBalanceCNS, int256 amountCNS, uint256 balanceCNS)",
  });

  let dailyVolume = 0;
  for (const log of logs) {
    const perpId = Number(log.perpId);
    const ps = PRICE_SCALE[perpId];
    const ss = SIZE_SCALE[perpId];
    if (!ps || !ss) continue; // unknown market — skip rather than mis-scale
    const notional = (Number(log.pricePNS) / ps) * (Number(log.lotLNS) / ss);
    dailyVolume += notional;
  }

  return { dailyVolume };
};

const adapter: Adapter = {
  version: 2,
  chains: [CHAIN.MONAD],
  fetch,
  start: "2026-02-15",
  methodology: {
    Volume:
      "Sum of notional traded on Perpl perpetual futures across BTC, MON, ETH, SOL, HYPE markets. Computed from MakerOrderFilled events emitted by the Exchange contract (0x34B6...12a6F), decoded with each market's pricePNS / lotLNS decimal scales. One-sided (per DefiLlama convention).",
  },
};

export default adapter;
