import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";
import { getUniV2LogAdapter } from "../helpers/uniswap";

const API_URL = "https://v3.potatoswap.finance/api/pool/list-all";

// Labels kept identical to the ones getUniV2LogAdapter emits, so the breakdown
// is consistent whether the API path (recent) or the on-chain log path (older)
// runs for a given day.
const LABELS = {
  SwapFees: 'Token Swap Fees',
  TradingFees: 'Trading fees',
  ProtocolFees: 'Protocol fees',
  LPFees: 'LP fees',
  TokenholderFees: 'Tokenholder fees',
}

const fetch = async (options: FetchOptions) => {
  const response = await fetchURL(API_URL);
  const pools = response.data.pools;

  const timeNow = Math.floor(Date.now() / 1000)
  const isCloseToCurrentTime = Math.abs(timeNow - options.toTimestamp) < 3600 * 6 // 6 hour

  if (isCloseToCurrentTime) {

    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();

    for (const { protocol_version, volume_24h_usd, fee_24h_usd } of pools) {
      if (protocol_version !== "v2") continue;

      dailyVolume.addUSDValue(Number(volume_24h_usd));
      dailyFees.addUSDValue(Number(fee_24h_usd), LABELS.SwapFees);
    }

    const dailySupplySideRevenue = dailyFees.clone(0.17 / 0.25, LABELS.LPFees);
    const dailyHoldersRevenue = dailyFees.clone(0.08 / 0.25, LABELS.TokenholderFees);

    return {
      dailyVolume,
      dailyFees,
      dailyRevenue: dailyFees.clone(0.08 / 0.25, LABELS.ProtocolFees),
      dailyUserFees: dailyFees.clone(1, LABELS.TradingFees),
      dailySupplySideRevenue,
      dailyProtocolRevenue: 0,
      dailyHoldersRevenue,
    };
  }
  return getUniV2LogAdapter({ factory: '0x630db8e822805c82ca40a54dae02dd5ac31f7fcf', userFeesRatio: 1, revenueRatio: 8 / 25, protocolRevenueRatio: 0, holdersRevenueRatio: 8 / 25 })(options)

};

const methodology = {
  Fees: "PotatoSwap charges a 0.25% swap fee on v2 pools.",
  UserFees: "Users pay a 0.25% swap fee per trade.",
  Revenue: "0.08% of swap volume (the non-LP share) is distributed to vePOT holders.",
  SupplySideRevenue:
    "Liquidity providers receive 0.17% of swap volume.",
  HoldersRevenue:
    "0.08% of swap volume is distributed to vePOT holders.",
  ProtocolRevenue:
    "The protocol does not retain a direct fee share.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.SwapFees]: "0.25% swap fee paid by users on PotatoSwap v2 pools.",
  },
  UserFees: {
    [LABELS.TradingFees]: "0.25% swap fee paid by users per trade.",
  },
  Revenue: {
    [LABELS.ProtocolFees]: "0.08% of swap volume (non-LP share) going to vePOT holders.",
  },
  SupplySideRevenue: {
    [LABELS.LPFees]: "0.17% of swap volume distributed to liquidity providers.",
  },
  HoldersRevenue: {
    [LABELS.TokenholderFees]: "0.08% of swap volume distributed to vePOT holders.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.XLAYER],
  start: '2024-04-16',
  methodology,
  breakdownMethodology,
};

export default adapter;