import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getPolymarketVolume } from "../../helpers/polymarket";

// Hermes Trade - Polymarket-style prediction market CLOB on Monad
const EXCHANGE_CONTRACT_ADDRESSES = [
  "0x017641abFa4264121237023f9Fe678BF00F60De8", // CTFExchange (regular / sports)
  "0x50b7B00EE75F8bFb5cDa892883aFb3867851c738", // NegRiskCtfExchange
];

// The exchange collateral (assetId 0) is USDW (0xb7bD080Df56FA76ce6CA4fA737d47815f7F8e746),
// a $1 receipt token 1:1 with USDC that shares USDC's 6 decimals. USDW is not priced by
// DefiLlama, so we value the collateral-side fills with the priced USDC feed.
const USDC = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603";

const fetch = async (options: FetchOptions) => {
  const { dailyVolume, dailyNotionalVolume } = await getPolymarketVolume({
    options,
    exchanges: EXCHANGE_CONTRACT_ADDRESSES,
    currency: USDC,
  });

  return {
    dailyVolume,
    dailyNotionalVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.MONAD]: {
      fetch,
      start: "2026-05-18",
    },
  },
  methodology: {
    Volume:
      "Trading volume from OrderFilled events on the Hermes Trade CLOB exchanges (regular + NegRisk). Only the collateral (USDW, valued as USDC) side of each fill is counted and amounts are halved to correct for the maker + taker double counting, matching the Polymarket methodology.",
  },
};

export default adapter;
