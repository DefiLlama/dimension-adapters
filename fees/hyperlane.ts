import { Adapter, Dependencies, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

type HyperlaneFee = {
  chain: string;
  payment: string;
  hyperlane_payment: string;
  other_payment: string;
}

type ChainConfig = {
  start: string;
  duneSchema: string;
  igp: string;
}

const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.ARBITRUM]: {
    start: "2025-01-01",
    duneSchema: "hyperlane_v3_arbitrum",
    igp: "0x3b6044acd6767f017e99318aa6ef93b7b06a5a22",
  },
  [CHAIN.AVAX]: {
    start: "2025-01-01",
    duneSchema: "hyperlane_v3_avalanche_c",
    igp: "0x95519ba800bbd0d34eeae026fec620ad978176c0",
  },
  [CHAIN.BSC]: {
    start: "2025-01-01",
    duneSchema: "hyperlane_v3_bnb",
    igp: "0x78e25e7f84416e69b9339b0a6336eb6efff6b451",
  },
  [CHAIN.BASE]: {
    start: "2025-01-01",
    duneSchema: "hyperlane_v3_base",
    igp: "0xc3f23848ed2e04c0c6d41bd7804fa8f89f940b94",
  },
  [CHAIN.BLAST]: {
    start: "2025-01-01",
    duneSchema: "hyperlane_v3_blast",
    igp: "0xb3fccd379ad66ced0c91028520c64226611a48c9",
  },
  [CHAIN.CELO]: {
    start: "2025-01-01",
    duneSchema: "hyperlane_v3_celo",
    igp: "0x571f1435613381208477ac5d6974310d88ac7cb7",
  },
  [CHAIN.ETHEREUM]: {
    start: "2025-01-01",
    duneSchema: "hyperlane_v3_ethereum",
    igp: "0x9e6b1022be9bbf5afd152483dad9b88911bc8611",
  },
  [CHAIN.XDAI]: {
    start: "2025-01-01",
    duneSchema: "hyperlane_v3_gnosis",
    igp: "0xdd260b99d302f0a3ff885728c086f729c06f227f",
  },
  [CHAIN.LINEA]: {
    start: "2025-01-01",
    duneSchema: "hyperlane_v3_linea",
    igp: "0x8105a095368f1a184ccea86cce21318b5ee5be28",
  },
  [CHAIN.OPTIMISM]: {
    start: "2025-01-01",
    duneSchema: "hyperlane_v3_optimism",
    igp: "0xd8a76c4d91fcbb7cc8ea795dfdf870e48368995c",
  },
  [CHAIN.POLYGON]: {
    start: "2025-01-01",
    duneSchema: "hyperlane_v3_polygon",
    igp: "0x0071740bf129b05c4684abfbbed248d80971cce2",
  },
  [CHAIN.POLYGON_ZKEVM]: {
    start: "2025-01-01",
    duneSchema: "hyperlane_v3_zkevm",
    igp: "0x0d63128d887159d63de29497dfa45afc7c699ae4",
  },
  [CHAIN.SCROLL]: {
    start: "2025-01-01",
    duneSchema: "hyperlane_v3_scroll",
    igp: "0xbf12ef4b9f307463d3fb59c3604f294ddce287e2",
  },
  [CHAIN.MANTLE]: {
    start: "2025-01-01",
    duneSchema: "hyperlane_v3_mantle",
    igp: "0x8105a095368f1a184ccea86cce21318b5ee5be28",
  },
};

const IGP_FEES = "Interchain Gas Payments";

const selectGasPayments = ([chain, config]: [string, ChainConfig], options: FetchOptions) => `
  select
    '${chain}' as chain,
    payment,
    contract_address = ${config.igp} as is_hyperlane_relayer
  from ${config.duneSchema}.InterchainGasPaymaster_evt_GasPayment
  where evt_block_time >= from_unixtime(${options.startTimestamp})
    and evt_block_time < from_unixtime(${options.endTimestamp})
`;

const query = (options: FetchOptions) => `
with gas_payments as (
${Object.entries(chainConfig).map(config => selectGasPayments(config, options)).join("  union all")}
)
select
  chain,
  sum(payment) as payment,
  sum(if(is_hyperlane_relayer, payment, 0)) as hyperlane_payment,
  sum(if(is_hyperlane_relayer, 0, payment)) as other_payment
from gas_payments
group by 1
`;

const prefetch = (options: FetchOptions) =>
  queryDuneSql(options, query(options), { extraUIDKey: "hyperlane-fees" });

const fetch = async (options: FetchOptions) => {
  const event = (options.preFetchedResults as HyperlaneFee[] | undefined)?.find(row =>
    row.chain === options.chain
  );
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  if (event?.payment) {
    dailyFees.addGasToken(event.payment, IGP_FEES);
    dailyRevenue.addGasToken(event.hyperlane_payment, IGP_FEES);
    dailySupplySideRevenue.addGasToken(event.other_payment, IGP_FEES);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  UserFees: "User-paid Hyperlane interchain gas payments from InterchainGasPaymaster GasPayment events.",
  Fees: "User-paid Hyperlane interchain gas payments from InterchainGasPaymaster GasPayment events.",
  SupplySideRevenue: "Gross IGP payments to non-Hyperlane relayer contracts when present.",
  Revenue: "Gross IGP payments to Hyperlane-published relayer contracts.",
  ProtocolRevenue: "Gross IGP payments to Hyperlane-published relayer contracts.",
};

const breakdownMethodology = {
  Fees: {
    [IGP_FEES]: "GasPayment payment fees from Hyperlane InterchainGasPaymaster.",
  },
  UserFees: {
    [IGP_FEES]: "User paid fees from Hyperlane InterchainGasPaymaster.",
  },
  SupplySideRevenue: {
    [IGP_FEES]: "Gross IGP payments to non-Hyperlane relayer contracts when present.",
  },
  Revenue: {
    [IGP_FEES]: "Gross IGP payments to Hyperlane-published relayer contracts.",
  },
  ProtocolRevenue: {
    [IGP_FEES]: "Gross IGP payments to Hyperlane-published relayer contracts.",
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
