import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

/**
 * Fomotail — copytrade bot on Robinhood Chain (chainId 4663).
 *
 * A user copies a trader; on every profitable close Fomotail charges a 2% performance fee on the
 * realised profit (winners only — losing positions pay nothing), split:
 *   - 1.2% to the copied trader     -> supply-side revenue
 *   - 0.8% to the protocol treasury -> protocol revenue
 * Every fee payout is a USDG transfer.
 *
 * Protocol revenue is measured DIRECTLY on-chain as USDG transfers into the treasury wallet
 * (its only inflow). Total fees and the trader (supply-side) share are derived from the fixed
 * 0.8% / 2% split. USDG (Global Dollar) is a $1 stablecoin.
 */

const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const TREASURY = "0x444d74c47987fb7ae8efb9e9ecf25721fa55fc57";

const fetch = async (options: FetchOptions) => {
  // Revenue = USDG received by the treasury during the day.
  const dailyRevenue = await addTokensReceived({ options, target: TREASURY, tokens: [USDG] });

  // Derive total fees and the trader share from the fixed split: the treasury's 0.8% is 40% of the
  // 2% fee, so totalFees = revenue x 2.5 and supplySide (trader 1.2%) = revenue x 1.5.
  const raw = BigInt(dailyRevenue.getBalances()[`${CHAIN.ROBINHOOD}:${USDG}`] ?? "0");
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  dailyFees.add(USDG, (raw * 5n) / 2n);
  dailySupplySideRevenue.add(USDG, (raw * 3n) / 2n);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "2% performance fee on the realised profit of each copied position, charged only on profitable closes.",
  Revenue: "The 0.8% of realised profit kept by the protocol, measured directly as USDG transfers into the treasury.",
  ProtocolRevenue: "All protocol revenue accrues to the treasury (identical to Revenue).",
  SupplySideRevenue: "The 1.2% of realised profit paid to the copied trader (leader), derived from the fixed fee split.",
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.ROBINHOOD]: {
      fetch,
      start: "2026-08-28", // first on-chain fee: 2026-08-29
    },
  },
};

export default adapter;
