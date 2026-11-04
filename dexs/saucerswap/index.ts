import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const methodology = {
  Fees: "A 0.3% fee is charged to users on every swap, 1/6 goes to protocol.",
  UserFees: "A 0.3% fee is charged to users on every swap, 1/6 goes to protocol.",
  SupplySideRevenue: "There are 5/6 of swap fees goes to liquidity providers.",
  Revenue: "There are 1/6 goes to protocol.",
  ProtocolRevenue: "From 2025-08-31 protocol revenue buys SAUCE; this is the share sent to the Development Fund and the POL and Incentive Reserve (54.5%, 40% from 2026-07-01, 50% from 2026-09-07). Before 2025-08-31, all protocol revenue.",
  HoldersRevenue: "From 2025-08-31 protocol revenue buys SAUCE; this is the share sent to xSAUCE stakers and burned (45.5%, 60% from 2026-07-01, 50% from 2026-09-07).",
};

// Protocol revenue (the fee-switch share of swap fees) buys SAUCE through BrewsaucerV2 (0.0.9575119), which splits what it
// bought between xSAUCE stakers (Mothership 0.0.1460199), the Development Fund (0.0.9453414), the POL and Incentive Reserve
// (0.0.9578664) and, from July 2026, a burn to 0xdead (0.0.9209843).
// https://docs.saucerswap.finance/tokenomics/overview#unified-brewsaucer-buybacks-and-burn
// Shares per era, read from every BrewsaucerV2 split transaction on the Hedera mirror node (372 splits to 2026-09-08):
// - first split 2025-08-31 14:13 UTC: 45.5% xSAUCE / 30% Development Fund / 24.5% POL and Incentive Reserve, no burn
// - last 3-way split 2026-06-30 23:00 UTC, first 4-way split 2026-07-01 23:01 UTC: 50% xSAUCE / 10% burn / 10% Development Fund / 30% POL
// - first split on the Unified BrewSaucer routing 2026-09-08 12:38:34 UTC (consensus 1788871114): 40% / 10% / 30% / 20%.
//   No split ran on 2026-09-07, so that day's fees went out on the new shares.
// Each daily split pays out the fees since the previous one, so each era starts at 00:00 UTC of the day its first split ran
// (the day before, for 2026-09-08). Before 2025-08-31 the split is not modelled and all revenue stays protocol revenue.
const SPLITS = [
  { start: 1788739200, xsauce: 0.4, burn: 0.1, devFund: 0.3, pol: 0.2 },    // 2026-09-07
  { start: 1782864000, xsauce: 0.5, burn: 0.1, devFund: 0.1, pol: 0.3 },    // 2026-07-01
  { start: 1756598400, xsauce: 0.455, burn: 0, devFund: 0.3, pol: 0.245 },  // 2025-08-31
]

function splitRevenue(options: FetchOptions, revenue: number) {
  const dailyProtocolRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()
  const split = SPLITS.find((s) => options.startOfDay >= s.start)
  if (!split) {
    dailyProtocolRevenue.addUSDValue(revenue, 'Swap Fees To Protocol')
  } else {
    dailyHoldersRevenue.addUSDValue(revenue * split.xsauce, 'Token Buy Back To xSAUCE Stakers')
    if (split.burn) dailyHoldersRevenue.addUSDValue(revenue * split.burn, 'Token Buy Back And Burn')
    dailyProtocolRevenue.addUSDValue(revenue * split.devFund, 'Token Buy Back To Development Fund')
    dailyProtocolRevenue.addUSDValue(revenue * split.pol, 'Token Buy Back To POL And Incentive Reserve')
  }
  return { dailyProtocolRevenue, dailyHoldersRevenue }
}

const breakdownMethodology = {
  Fees: {
    'Token Swap Fees': 'A 0.3% fee charged on every swap.',
  },
  UserFees: {
    'Token Swap Fees': 'A 0.3% fee charged on every swap.',
  },
  SupplySideRevenue: {
    'Swap Fees To LPs': '5/6 of swap fees, paid to liquidity providers.',
  },
  Revenue: {
    'Swap Fees To Protocol': '1/6 of swap fees, the protocol fee switch.',
  },
  ProtocolRevenue: {
    'Swap Fees To Protocol': 'All protocol revenue before 2025-08-31, when BrewsaucerV2 splits start.',
    'Token Buy Back To Development Fund': 'SAUCE bought with protocol revenue and sent to the Development Fund: 30% of each buy, 10% from 2026-07-01, 30% from 2026-09-07.',
    'Token Buy Back To POL And Incentive Reserve': 'SAUCE bought with protocol revenue and sent to the POL and Incentive Reserve: 24.5% of each buy, 30% from 2026-07-01, 20% from 2026-09-07.',
  },
  HoldersRevenue: {
    'Token Buy Back To xSAUCE Stakers': 'SAUCE bought with protocol revenue and sent to the Mothership, which raises the xSAUCE to SAUCE ratio: 45.5% of each buy, 50% from 2026-07-01, 40% from 2026-09-07.',
    'Token Buy Back And Burn': 'SAUCE bought with protocol revenue and sent to 0xdead: 10% of each buy from 2026-07-01.',
  },
}


const API_INFLATED_DAYS = [
  1772755200, // 2026-03-06
  1773446400 // 2026-03-14
]

const fetch = async (options: FetchOptions) => {
  const { startOfDay } = options
  const platformData: Array<any> = await httpGet(`https://server.saucerswap.finance/api/public/pools/platform-data?field=VOLUME_USD&interval=DAY&from=${startOfDay}&to=${startOfDay + 24 * 3600}`,
    {
      headers: {
        origin: "https://www.saucerswap.finance",
      },
    },
  );
  const _dailyVolume = platformData.find(
    (dayItem: any) => Number(dayItem.timestampSeconds) === startOfDay,
  );
  
  if (!_dailyVolume) {
    throw Error(`can not found value data for date ${startOfDay}`)
  }

  const dailyVolume = API_INFLATED_DAYS.includes(startOfDay) ? 0 : Number(_dailyVolume ? _dailyVolume.value : 0)
  
  // https://docs.saucerswap.finance/protocol/saucerswap-v1
  // v1 charges fee 0.3% per swap, 5/6 goes to LP, 1/6 goes to protocol
  const fees = dailyVolume * 0.003;
  const revenue = (fees * 1) / 6;

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(fees, 'Token Swap Fees');
  const dailyRevenue = options.createBalances();
  dailyRevenue.addUSDValue(revenue, 'Swap Fees To Protocol');
  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addUSDValue((fees * 5) / 6, 'Swap Fees To LPs');
  const { dailyProtocolRevenue, dailyHoldersRevenue } = splitRevenue(options, revenue);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.HEDERA],
  start: "2022-07-31",
  methodology,
  breakdownMethodology,
};

export default adapter;
