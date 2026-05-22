/**
 * DeFiLlama dimension-adapter for PRED — volume.
 *
 * Mirrors Polymarket's published methodology (DefiLlama/dimension-adapters/dexs/polymarket/index.ts):
 *
 *   volume_usd_per_event = (makerAssetId == 0) ? makerAmountFilled : takerAmountFilled
 *   dailyVolume          = ( Σ over OrderFilled events { volume_usd_per_event } ) / 2 / 1e6
 *
 * Divided by 2 because every matchOrders() call emits both a taker-side and N maker-side
 * OrderFilled events whose USDC amounts sum to 2 × the actual notional. See
 * Polymarket/ctf-exchange/src/exchange/mixins/Trading.sol::_matchOrders (emits OrderFilled for the
 * taker order) and _fillMakerOrder (emits OrderFilled per maker leg). PRED's NegRiskCtfExchange
 * inherits CTFExchange unchanged, and CrossMatchingAdapter emits the same event signature.
 */
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getPolymarketVolume } from "../../helpers/polymarket";

// All four contracts emit the canonical CTFExchange OrderFilled signature:
//   event OrderFilled(
//     bytes32 indexed orderHash,
//     address indexed maker,
//     address indexed taker,
//     uint256 makerAssetId,
//     uint256 takerAssetId,
//     uint256 makerAmountFilled,
//     uint256 takerAmountFilled,
//     uint256 fee
//   )
// → topic0 = 0xd0a08e8c493f9c94f29311604c9de1b4e8c8d4c06bd0c789af57f2d65bfec0f6
//
// PRED redeployed its CLOB stack mid-lifecycle (analogous to Polymarket's v1 → v2 split),
// so the historically-complete volume series requires scanning both the current and the
// legacy NegRiskCtfExchange / CrossMatchingAdapter pairs. Same dedupe rules apply uniformly.
const NEG_RISK_CTF_EXCHANGE = "0x1938Af63B717B80ea62ccB4CCBf799F8a28dEFB0";
const CROSS_MATCHING_ADAPTER = "0xC574A05e622A769e6aB14293070cDF6cADB55F98";
const NEG_RISK_CTF_EXCHANGE_LEGACY = "0xcc9D4EA7c86f2d6d67a44BC5e7A8932699ddDDa1";
const CROSS_MATCHING_ADAPTER_LEGACY = "0x7B39c530C3F2Ea4056f1a3bBa777F82bBDFB047A";

const BASE_USDC = "0x833589fCD6eDb6E08f4c7c32D4f71b54bdA02913";

const fetch = async (options: FetchOptions) => {
  const { dailyVolume, dailyNotionalVolume } = await getPolymarketVolume({
    options,
    exchanges: [
      NEG_RISK_CTF_EXCHANGE,
      CROSS_MATCHING_ADAPTER,
      NEG_RISK_CTF_EXCHANGE_LEGACY,
      CROSS_MATCHING_ADAPTER_LEGACY,
    ],
    currency: BASE_USDC,
  });

  return {
    dailyVolume,
    dailyFees: 0,
    dailyNotionalVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Volume:
      "USDC notional of every fill emitted by PRED's CLOB stack on Base. Scans OrderFilled across both the current pair (NegRiskCtfExchange 0x1938…fB0, CrossMatchingAdapter 0xC574…5F98) and the legacy pair that preceded it (NegRiskCtfExchange 0xcc9D…DDa1, CrossMatchingAdapter 0x7B39…047A). For each event we take the USDC-side amount (makerAmountFilled when makerAssetId == 0, otherwise takerAmountFilled) and divide the daily total by 2 to dedupe the paired taker / maker OrderFilled events emitted per match. Same formula DefiLlama uses for Polymarket — see dimension-adapters/helpers/polymarket.ts.",
    NotionalVolume:
      "Number of YES/NO outcome-token shares transferred across the same OrderFilled events (the non-USDC side), divided by 2 for the same dedupe reason.",
  },
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      // Earliest exchange deployment on Base: legacy NegRiskCtfExchange 0xcc9D…DDa1
      // at block 41_743_588 (2026-02-05 UTC, bisected via volume/src/findDeployBlock.ts).
      // The current exchange pair came online later at block ~45_897_300 (2026-05-12 UTC).
      start: "2026-02-05",
    },
  },
};

export default adapter;
