// Vultisig is a self-custodial MPC wallet; its native cross-chain swaps route through THORChain
// and MayaChain with per-platform affiliate names (v0 SDK/desktop/extension, vi iOS, va Android).
// Numbers come from Vultisig's own analytics service - the same source the team reports from -
// which attributes swaps per provider (thorchain, mayachain, lifi, kyberswap, 1inch). Only the
// thorchain and mayachain sources are counted here: LI.FI, KyberSwap and 1inch swaps are already
// counted inside those providers' own DefiLlama listings, so including them would double count.
// Cross-checked against public Midgard affiliate attribution for the v0/vi/va THORNames: daily
// volume matches to the cent on non-streaming days (e.g. 2026-08-09: 5,065.81 vs 5,065.80);
// streaming-swap accounting can differ by a few percent on heavy days.
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const ANALYTICS_API = "https://analytics.vultisig.com";

const SOURCE_BY_CHAIN: Record<string, string> = {
  [CHAIN.THORCHAIN]: "thorchain",
  [CHAIN.MAYA]: "mayachain",
};

const AFFILIATE_FEES = "Swap Affiliate Fees";
const FEES_TO_VULTISIG = "Affiliate Fees to Vultisig Fee Wallet";

type RevenueRow = { date: string; source: string; revenue: number };

// version 1: the analytics service serves daily rows.
const fetch = async (options: FetchOptions) => {
  const day = new Date(options.startOfDay * 1000).toISOString().slice(0, 10);
  const source = SOURCE_BY_CHAIN[options.chain];
  const { revenueOverTime } = await httpGet(`${ANALYTICS_API}/api/revenue?r=all&g=d`);

  const total = (revenueOverTime as RevenueRow[])
    .filter((row) => row.source === source && row.date.slice(0, 10) === day)
    .reduce((sum, row) => sum + row.revenue, 0);

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(total, AFFILIATE_FEES);
  const dailyRevenue = options.createBalances();
  dailyRevenue.addUSDValue(total, FEES_TO_VULTISIG);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "Affiliate fees charged on the swaps Vultisig routes natively through THORChain and MayaChain (basis-point affiliate fee per swap), reported by Vultisig's analytics service.",
  UserFees: "Same as Fees - the affiliate fee is taken out of the swap and paid by the user.",
  Revenue: "All affiliate fees accrue to Vultisig. Referrer cuts are paid by THORChain under the referrer's own THORName and never land on the Vultisig affiliate names.",
  ProtocolRevenue: "All revenue is protocol revenue; it is settled to the Vultisig fee wallet.",
};

const breakdownMethodology = {
  Fees: {
    [AFFILIATE_FEES]: "Affiliate fee charged on swaps routed by Vultisig.",
  },
  UserFees: {
    [AFFILIATE_FEES]: "Affiliate fee charged on swaps routed by Vultisig, paid by the swapping user.",
  },
  Revenue: {
    [FEES_TO_VULTISIG]: "Affiliate fees collected under the Vultisig affiliate names, settled to the Vultisig fee wallet.",
  },
  ProtocolRevenue: {
    [FEES_TO_VULTISIG]: "Affiliate fees collected under the Vultisig affiliate names, settled to the Vultisig fee wallet.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: {
    [CHAIN.THORCHAIN]: { start: "2024-04-16" },
    [CHAIN.MAYA]: { start: "2024-09-10" },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
