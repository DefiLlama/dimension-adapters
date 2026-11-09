// Vultisig charges a basis-point affiliate fee on the native swaps it routes through THORChain
// and MayaChain, tagged with per-platform affiliate names (v0 SDK/desktop/extension, vi iOS,
// va Android). Fee numbers come from Vultisig's own analytics service - the same source the team
// reports from. Cross-check: daily fees track the configured affiliate rate against routed volume
// (e.g. 2026-08-10: $250.73 on $50,304.91 routed = 49.8 bps against the 50 bps SDK rate).
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const ANALYTICS_API = "https://analytics.vultisig.com";

// start = first day the analytics service reports the source
const chainConfig: Record<string, { start: string; source: string; feeLabel: string; revenueLabel: string }> = {
  [CHAIN.THORCHAIN]: {
    start: "2024-04-16",
    source: "thorchain",
    feeLabel: "THORChain Swap Affiliate Fees",
    revenueLabel: "THORChain Affiliate Fees to Vultisig Fee Wallet",
  },
  [CHAIN.MAYA]: {
    start: "2024-09-10",
    source: "mayachain",
    feeLabel: "MayaChain Swap Affiliate Fees",
    revenueLabel: "MayaChain Affiliate Fees to Vultisig Fee Wallet",
  },
};

type RevenueRow = { date: string; source: string; revenue: number };

// One request serves every (day, chain) fetch: relative ranges (r=7d, ...) would omit older
// adapter dates, so the full daily history is fetched once and memoized for the run.
let revenueRows: Promise<RevenueRow[]> | undefined;
const getRevenueRows = () =>
  (revenueRows ??= httpGet(`${ANALYTICS_API}/api/revenue?r=all&g=d`).then(
    (res) => res.revenueOverTime as RevenueRow[],
  ));

// version 1: the analytics service serves daily rows.
const fetch = async (options: FetchOptions) => {
  const { source, feeLabel, revenueLabel } = chainConfig[options.chain];
  const rows = await getRevenueRows();

  const sourceRows = rows.filter((row) => row.source === source);
  if (!sourceRows.length) {
    throw new Error(`No rows found for ${source}`);
  }
  const todaysRows = sourceRows.filter((row) => row.date.slice(0, 10) === options.dateString);

  const total = todaysRows.reduce((sum, row) => sum + row.revenue, 0);

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(total, feeLabel);
  const dailyRevenue = options.createBalances();
  dailyRevenue.addUSDValue(total, revenueLabel);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const thorchain = chainConfig[CHAIN.THORCHAIN];
const maya = chainConfig[CHAIN.MAYA];

const methodology = {
  Fees: "Affiliate fees charged on the swaps Vultisig routes natively through THORChain and MayaChain (basis-point affiliate fee per swap), reported by Vultisig's analytics service.",
  UserFees: "Same as Fees - the affiliate fee is taken out of the swap and paid by the user.",
  Revenue: "All affiliate fees accrue to Vultisig. Referrer cuts are paid by THORChain under the referrer's own THORName and never land on the Vultisig affiliate names.",
  ProtocolRevenue: "All affiliate fees accrue to Vultisig. Referrer cuts are paid by THORChain under the referrer's own THORName and never land on the Vultisig affiliate names.",
};

const breakdownMethodology = {
  Fees: {
    [thorchain.feeLabel]: "Affiliate fee charged on THORChain swaps routed by Vultisig.",
    [maya.feeLabel]: "Affiliate fee charged on MayaChain swaps routed by Vultisig.",
  },
  UserFees: {
    [thorchain.feeLabel]: "Affiliate fee charged on THORChain swaps routed by Vultisig, paid by the swapping user.",
    [maya.feeLabel]: "Affiliate fee charged on MayaChain swaps routed by Vultisig, paid by the swapping user.",
  },
  Revenue: {
    [thorchain.revenueLabel]: "THORChain affiliate fees collected under the Vultisig affiliate names, settled to the Vultisig fee wallet.",
    [maya.revenueLabel]: "MayaChain affiliate fees collected under the Vultisig affiliate names, settled to the Vultisig fee wallet.",
  },
  ProtocolRevenue: {
    [thorchain.revenueLabel]: "THORChain affiliate fees collected under the Vultisig affiliate names, settled to the Vultisig fee wallet.",
    [maya.revenueLabel]: "MayaChain affiliate fees collected under the Vultisig affiliate names, settled to the Vultisig fee wallet.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
};

export default adapter;
