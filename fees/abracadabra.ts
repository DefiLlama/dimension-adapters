import { Adapter, Dependencies, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { METRIC } from "../helpers/metrics";

type ChainConfig = {
  start: string;
  duneSchema: string;
  cauldrons?: string[];
  degenBox?: boolean;
}

type DuneFee = {
  chain: string;
  metric: string;
  token?: string;
  amount: string;
}

const MIM = "magic-internet-money";
const BORROW = "borrow";
const FLASHLOAN = "flashloan";

const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.ETHEREUM]: {
    start: "2021-09-01",
    duneSchema: "abracadabra_ethereum",
    degenBox: true,
    cauldrons: [
      "cauldronlowriskv1_evt_logaccrue",
      "cauldronmediumriskv1_evt_logaccrue",
      "cauldronv1_evt_logaccrue",
      "cauldronv2_evt_logaccrue",
      "cauldronv3_evt_logaccrue",
      "cauldronv4_2_evt_logaccrue",
      "cauldronv4_crv2_evt_logaccrue",
      "cauldronv4_evt_logaccrue",
      "crv_cauldronv4_evt_logaccrue",
    ],
  },
  [CHAIN.FANTOM]: {
    start: "2021-09-01",
    duneSchema: "abracadabra_fantom",
    degenBox: true,
    cauldrons: [
      "cauldronv2_evt_logaccrue",
      "cauldronv2ftm_evt_logaccrue",
    ],
  },
  [CHAIN.AVAX]: {
    start: "2021-09-01",
    duneSchema: "abracadabra_avalanche_c",
    degenBox: true,
    cauldrons: [
      "avax_market_evt_logaccrue",
      "cauldronv2_evt_logaccrue",
      "mim_avax_jlp_evt_logaccrue",
      "mim_avax_slp_evt_logaccrue",
      "usdc_avax_jlp_evt_logaccrue",
      "usdt_avax_jlp_evt_logaccrue",
      "wmemo_evt_logaccrue",
      "wmemo_v2_evt_logaccrue",
      "xjoe_evt_logaccrue",
    ],
  },
  [CHAIN.BSC]: {
    start: "2021-09-01",
    duneSchema: "abracadabra_bnb",
    degenBox: true,
    cauldrons: ["cauldronv2_evt_logaccrue"],
  },
  [CHAIN.ARBITRUM]: {
    start: "2021-09-01",
    duneSchema: "abracadabra_arbitrum",
    degenBox: true,
    cauldrons: [
      "cauldronv2_evt_logaccrue",
      "cauldronv2multichain_eth_evt_logaccrue",
      "cauldronv4_evt_logaccrue",
    ],
  },
  [CHAIN.OPTIMISM]: {
    start: "2021-09-01",
    duneSchema: "abracadabra_optimism",
    degenBox: true,
    cauldrons: [
      "cauldronv3_2_evt_logaccrue",
      "cauldronv3_evt_logaccrue",
    ],
  },
};

const selectAccrues = ([chain, config]: [string, ChainConfig], options: FetchOptions) =>
  (config.cauldrons ?? []).map(table => `
    select '${chain}' as chain, '${BORROW}' as metric, cast(null as varchar) as token, accruedAmount as amount
      , evt_tx_hash, evt_index
    from ${config.duneSchema}.${table}
    where evt_block_date >= date(from_unixtime(${options.startTimestamp}))
      and evt_block_date < date(from_unixtime(${options.endTimestamp}))
      and evt_block_time >= from_unixtime(${options.startTimestamp})
      and evt_block_time < from_unixtime(${options.endTimestamp})
  `).join(" union all ");

const selectFlashLoans = ([chain, config]: [string, ChainConfig], options: FetchOptions) => config.degenBox ? `
    select '${chain}' as chain, '${FLASHLOAN}' as metric, cast(token as varchar) as token, feeAmount as amount
      , evt_tx_hash, evt_index
    from ${config.duneSchema}.degenbox_evt_logflashloan
    where evt_block_date >= date(from_unixtime(${options.startTimestamp}))
      and evt_block_date < date(from_unixtime(${options.endTimestamp}))
      and evt_block_time >= from_unixtime(${options.startTimestamp})
      and evt_block_time < from_unixtime(${options.endTimestamp})
  ` : "";

const selectFees = (config: [string, ChainConfig], options: FetchOptions) =>
  [selectAccrues(config, options), selectFlashLoans(config, options)]
    .filter(Boolean)
    .join(" union all ");

const query = (options: FetchOptions) => `
with fees as (
${Object.entries(chainConfig).map(config => selectFees(config, options)).filter(Boolean).join(" union all ")}
), deduped_fees as (
  select chain, metric, token, evt_tx_hash, evt_index, max(amount) as amount
  from fees
  group by 1, 2, 3, 4, 5
)
select chain, metric, token, sum(amount) as amount
from deduped_fees
group by 1, 2, 3
`;

const prefetch = (options: FetchOptions) =>
  queryDuneSql(options, query(options), { extraUIDKey: "abracadabra-fees" });

const fetch = async (options: FetchOptions) => {
  const rows = (options.preFetchedResults as DuneFee[] | undefined)?.filter(item => item.chain === options.chain) ?? [];
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  rows.forEach(row => {
    if (row.metric === BORROW) {
      const amount = Number(row.amount) / 1e18;
      dailyFees.addCGToken(MIM, amount, METRIC.BORROW_INTEREST);
      dailyRevenue.addCGToken(MIM, amount / 2, METRIC.PROTOCOL_FEES);
      dailySupplySideRevenue.addCGToken(MIM, amount / 2, METRIC.BORROW_INTEREST);
    } else if (row.metric === FLASHLOAN) {
      dailyFees.add(row.token!, row.amount, METRIC.FLASHLOAN_FEES);
      dailySupplySideRevenue.add(row.token!, row.amount, METRIC.FLASHLOAN_FEES);
    }
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Borrow interest accrued across Abracadabra Cauldrons and DegenBox flashloan fees.",
  Revenue: "50% of borrow interest retained by the Abracadabra protocol.",
  ProtocolRevenue: "50% of borrow interest retained by the Abracadabra protocol.",
  SupplySideRevenue: "50% of borrow interest distributed to MIM lenders plus DegenBox flashloan fees distributed to token depositors.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: "Interest accrued from borrowers across Abracadabra Cauldrons.",
    [METRIC.FLASHLOAN_FEES]: "Fees paid by DegenBox flashloan borrowers.",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "50% of total borrow interest retained by the Abracadabra protocol.",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: "50% of total borrow interest retained by the Abracadabra protocol.",
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]: "50% of total borrow interest distributed to MIM lenders.",
    [METRIC.FLASHLOAN_FEES]: "DegenBox flashloan fees distributed to token depositors.",
  },
};

const adapter: Adapter = {
  version: 2,
  adapter: chainConfig,
  prefetch,
  fetch,
  methodology,
  breakdownMethodology,
  dependencies: [Dependencies.DUNE],
};

export default adapter;
