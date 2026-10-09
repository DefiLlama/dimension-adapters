import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { httpGet } from "../utils/fetchURL";

// 2% since genesis: https://docs.celestia.org/learn/TIA/staking-governance-supply/#community-pool
// shortcut: fixed historical rate; add a dated split if governance changes the community tax.
const COMMUNITY_TAX = 0.02;

const url = (from: number, to: number) => `https://api.celenium.io/v1/stats/series/fee/day?from=${from}&to=${to}`
interface Fee {
  value: number
  time: string
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const res: Fee[] = await httpGet(url(options.fromTimestamp, options.toTimestamp))

  res.forEach(fee => {
    dailyFees.addCGToken('celestia', Number(fee.value) / 1e6, METRIC.TRANSACTION_GAS_FEES)
  })
  const dailyRevenue = dailyFees.clone(COMMUNITY_TAX, 'Transaction Fees To Community Pool');
  const dailySupplySideRevenue = dailyFees.clone(1 - COMMUNITY_TAX, 'Transaction Fees To Validators And Delegators');
  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  }
}

const adapter: SimpleAdapter = {
  chains: [CHAIN.CELESTIA],
  fetch,
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: 'Transaction fees paid in TIA, including PayForBlobs fees; excludes inflation rewards.',
    Revenue: '2% of transaction fees allocated to the governance-controlled community pool; excludes inflation rewards.',
    ProtocolRevenue: '2% of transaction fees allocated to the governance-controlled community pool; excludes inflation rewards.',
    SupplySideRevenue: '98% of transaction fees distributed to validators and delegators; excludes inflation rewards.',
    HoldersRevenue: 'No fee burns or buybacks; validator and delegator fee rewards are counted as supply-side revenue.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRANSACTION_GAS_FEES]: 'Transaction fees paid in TIA, including PayForBlobs fees.',
    },
    Revenue: {
      'Transaction Fees To Community Pool': '2% of transaction fees allocated to the governance-controlled community pool.',
    },
    ProtocolRevenue: {
      'Transaction Fees To Community Pool': '2% of transaction fees allocated to the governance-controlled community pool.',
    },
    SupplySideRevenue: {
      'Transaction Fees To Validators And Delegators': '98% of transaction fees distributed to validators and delegators.',
    },
  },
}

export default adapter;
