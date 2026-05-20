import { FetchOptions, SimpleAdapter, FetchResultV2 } from "../../adapters/types.ts";
import { CHAIN } from "../../helpers/chains.ts";
import ADDRESSES from "../../helpers/coreAssets.json";
import { addTokensReceived } from "../../helpers/token.ts";

const ProtocolTreasury = "0x5e91b40467fb8902c46a7b6cb90482363188d645";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const treasuryInflow = await addTokensReceived({ options, tokens: [ADDRESSES.arbitrum.USDC_CIRCLE], targets: [ProtocolTreasury] });

  // Treasury receives 10% of top-line spreads paid by users; the remaining 90%
  // funds OLP PnL, loss refunds, referral rewards, and hedging costs (treated
  // as cost of revenue, same approach as Hyperliquid HLP).
  const dailyFees = treasuryInflow.clone(10);
  const dailyRevenue = treasuryInflow;
  const dailyProtocolRevenue = treasuryInflow;
  const dailySupplySideRevenue = treasuryInflow.clone(9);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: "2025-11-15", // first tx
  methodology: {
    Fees: "Top-line spreads paid by users, derived as 10x the inflow to the protocol treasury (treasury receives a fixed 10% of spreads).",
    Revenue: "Protocol's share of spreads (10% to treasury). The remaining 90% funds the vertically-integrated OLP, loss refunds, and referral rewards, which are treated as cost of revenue.",
    ProtocolRevenue: "Inflow to the protocol treasury wallet.",
    SupplySideRevenue: "Remaining 90% of top-line spreads that funds the vertically-integrated OLP, loss refunds, and referral rewards.",
  },
};

export default adapter;
