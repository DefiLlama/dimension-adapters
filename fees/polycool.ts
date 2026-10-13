import ADDRESSES from "../helpers/coreAssets.json";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

/**
 * Polycool — copy-trading app for Polymarket (Telegram mini-app, iOS, Android).
 * https://polycoolapp.com · https://x.com/PolycoolApp · stats: https://polycoolapp.com/data
 *
 * Users trade Polymarket markets (manually or by copying leaders) from their own
 * wallet. Polycool charges a service fee on every buy and sell, 1.00% of the
 * notional for a new user, decreasing with lifetime volume down to 0.50%
 * ($100K+). The fee is pulled from the user's wallet at trade settlement as a
 * stablecoin transfer to the Polycool treasury on Polygon:
 *   - USDC.e until Polymarket's pUSD migration (first fee 2026-02-02),
 *   - pUSD (Polymarket's 1:1 USDC.e wrapper) since.
 *
 * Income statement:
 *   dailyFees     — service fees received by the treasury (gross)
 *   dailyUserFees — same: every fee is paid by the trader at fill time
 *
 * Revenue is not reported yet: Polycool pays referrers 25% of the fees generated
 * by the users they referred (about 6% of all fees to date). Those rewards accrue
 * off-chain and are paid on claim from a separate wallet that also funds other
 * payouts, so the referral share cannot be isolated on-chain. Until it can, only
 * gross fees are reported.
 */

// Polycool fee treasury on Polygon. Receives only the per-trade service fees
// (the payout, rewards and referral wallets are separate addresses).
const TREASURY = "0x5cd4d6c28efc65028afa307712976f97ea87615c";

const PUSD_POLYGON = ADDRESSES.polygon.PUSD;
const USDC_E_POLYGON = ADDRESSES.polygon.USDC;

const SERVICE_FEES = "Service fees";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const fees = await addTokensReceived({
    options,
    targets: [TREASURY],
    tokens: [PUSD_POLYGON, USDC_E_POLYGON],
  });
  dailyFees.add(fees, SERVICE_FEES);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: "Per-trade service fee charged by Polycool on every Polymarket buy and sell routed through the app: 1.00% of the notional for new users, decreasing with lifetime volume to 0.50% above $100K. Pulled from the trader's wallet at settlement and received by the Polycool treasury on Polygon as USDC.e (until the pUSD migration) or pUSD.",
    UserFees: "All fees are paid by the trader at fill time.",
  },
  breakdownMethodology: {
    Fees: {
      [SERVICE_FEES]: "Incoming pUSD and USDC.e `Transfer` events to the Polycool treasury `0x5cd4d6c28efc65028afa307712976f97ea87615c` on Polygon, each one a service fee pulled from a trader's wallet at trade settlement.",
    },
  },
  adapter: {
    [CHAIN.POLYGON]: {
      fetch,
      start: "2026-02-02",
    },
  },
};

export default adapter;
