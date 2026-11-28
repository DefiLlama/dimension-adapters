import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchBuilderCodeDataV2 } from "../../helpers/hyperliquid-v2";

// PicoSwap's Hyperliquid builder address; ownership statement signed at https://picoswap.xyz/treasury and https://basescan.org/verifySig/96297
const BUILDER_ADDRESS = "0x943f3e725c23f28fbee838fa30629cce9156365f";
// first day with a file at https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/<address>/<YYYYMMDD>.csv.lz4
const START = "2026-11-18";
// https://picoswap.xyz/docs/trading/fees: from this day 20% of builder fees go back to the trader as weekly USDC cashback
const CASHBACK_START = "2026-12-01";
const TRADER_CASHBACK_SHARE = 0.2;

const FEES = "Builder Code Fees";
const TO_PICOSWAP = "Builder Code Fees To PicoSwap";
const TO_TRADERS = "Builder Code Fees To Traders";

export function picoswapBuilderAdapter(market: "perps" | "spot", trades: string, feeRate: string): SimpleAdapter {
  const fetch = async (options: FetchOptions) => {
    const { dailyVolume, dailyFees: builderFees } = await fetchBuilderCodeDataV2({ options, builderAddresses: [BUILDER_ADDRESS], market });
    const cashbackShare = options.dateString >= CASHBACK_START ? TRADER_CASHBACK_SHARE : 0;
    return {
      dailyVolume,
      dailyFees: builderFees.clone(1, FEES),
      dailyRevenue: builderFees.clone(1 - cashbackShare, TO_PICOSWAP),
      dailyProtocolRevenue: builderFees.clone(1 - cashbackShare, TO_PICOSWAP),
      dailySupplySideRevenue: builderFees.clone(cashbackShare, TO_TRADERS),
    };
  };

  // the inviter's 30% is not recorded per trade, so it stays in revenue
  const kept = `Builder code fees on ${trades} placed through PicoSwap, minus the 20% paid back to traders as weekly USDC cashback from 2026-12-01; includes the 30% inviter share, which is not recorded per trade`;
  const cashback = `20% of the builder code fees on ${trades} placed through PicoSwap, paid back to the trader as weekly USDC cashback on Base from 2026-12-01.`;

  return {
    version: 1,
    fetch,
    chains: [CHAIN.HYPERLIQUID],
    start: START,
    doublecounted: true,
    methodology: {
      Volume: `Notional volume of ${trades} placed through PicoSwap with its builder code.`,
      Fees: `Builder code fees paid by users on ${trades} placed through PicoSwap (${feeRate}); excludes Hyperliquid's own trading fees.`,
      Revenue: `${kept}.`,
      ProtocolRevenue: `${kept}, kept by PicoSwap.`,
      SupplySideRevenue: cashback,
    },
    breakdownMethodology: {
      Fees: { [FEES]: `Builder code fees paid by users on ${trades} placed through PicoSwap (${feeRate}).` },
      Revenue: { [TO_PICOSWAP]: `${kept}.` },
      ProtocolRevenue: { [TO_PICOSWAP]: `${kept}, kept by PicoSwap.` },
      SupplySideRevenue: { [TO_TRADERS]: cashback },
    },
  };
}
