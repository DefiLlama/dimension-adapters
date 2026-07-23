import request from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const FEES = {
  // Source: https://yaka.gitbook.io/yaka-finance/protocol/v2-pool
  STABLE: 0.0004,
  VOLATILE: 0.0018,
  PROTOCOL: 0.12,
} as const;

const LABELS = {
  SWAP_FEES: "Swap Fees",
  SWAP_FEES_TO_PROTOCOL: "Swap Fees to protocol",
  SWAP_FEES_TO_VEYAKA: "Swap Fees to veYAKA",
} as const;

const PAGE_SIZE = 1000;
const PAIR_BATCH_SIZE = 1000;

const chainConfig: Record<string, { start: string; subgraph: string }> = {
  [CHAIN.SEI]: {
    start: "2024-07-01",
    // Live Yaka V2 subgraph used by yaka.finance.
    subgraph: "https://gateway.thegraph.com/api/9eb709a02809e8a79e1d5a49eca43da1/subgraphs/id/Az7CUeX9MdHCJwaeyYwKueMntgmH6b26NFTvLp4qa68f",
  },
};

const fetch = async (options: FetchOptions) => {
  const config = chainConfig[options.chain];
  const pairDayDatas: any[] = [];

  for (let skip = 0; ; skip += PAGE_SIZE) {
    const { pairDayDatas: page } = await request(config.subgraph, `
      query yakaV2PairDayDatas($date: Int!, $skip: Int!) {
        pairDayDatas(first: ${PAGE_SIZE}, skip: $skip, where: { date: $date }) {
          pairAddress
          dailyVolumeUSD
        }
      }
    `, { date: options.startOfDay, skip });

    pairDayDatas.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  const pairIds = [...new Set(pairDayDatas.map((pairDayData: any) => pairDayData.pairAddress.toLowerCase()))];
  const stablePairs = new Map<string, boolean>();
  for (let i = 0; i < pairIds.length; i += PAIR_BATCH_SIZE) {
    const { pairs } = await request(config.subgraph, `
      query yakaV2Pairs($ids: [ID!]!) {
        pairs(first: ${PAIR_BATCH_SIZE}, where: { id_in: $ids }) {
          id
          isStable
        }
      }
    `, { ids: pairIds.slice(i, i + PAIR_BATCH_SIZE) });

    pairs.forEach((pair: any) => stablePairs.set(pair.id.toLowerCase(), pair.isStable));
  }

  const v2 = pairDayDatas.reduce((totals: { volume: number; fees: number }, pairDayData: any) => {
    const pairAddress = pairDayData.pairAddress.toLowerCase();
    if (!stablePairs.has(pairAddress)) {
      return totals;
    }

    const volume = Number(pairDayData.dailyVolumeUSD);
    const feeRate = stablePairs.get(pairAddress) ? FEES.STABLE : FEES.VOLATILE;
    totals.volume += volume;
    totals.fees += volume * feeRate;
    return totals;
  }, { volume: 0, fees: 0 });

  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const v2ProtocolFees = v2.fees * FEES.PROTOCOL;
  const v2HolderFees = v2.fees * (1 - FEES.PROTOCOL);

  dailyFees.addUSDValue(v2.fees, LABELS.SWAP_FEES);
  dailyUserFees.addUSDValue(v2.fees, LABELS.SWAP_FEES);
  dailyProtocolRevenue.addUSDValue(v2ProtocolFees, LABELS.SWAP_FEES_TO_PROTOCOL);
  dailyHoldersRevenue.addUSDValue(v2HolderFees, LABELS.SWAP_FEES_TO_VEYAKA);
  dailyRevenue.addBalances(dailyProtocolRevenue);
  dailyRevenue.addBalances(dailyHoldersRevenue);

  return {
    dailyVolume: v2.volume,
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees: "Trading fees paid by users when swapping through Yaka V2 pools.",
  UserFees: "Trading fees paid by users on each Yaka V2 swap.",
  Revenue: "The share of trading fees kept by Yaka or paid to veYAKA holders.",
  ProtocolRevenue: "The 12% share of trading fees kept by Yaka.",
  HoldersRevenue: "The 88% share of trading fees paid to veYAKA holders.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.SWAP_FEES]: "Trading fees users pay when swapping through Yaka V2 stable and volatile pools.",
  },
  UserFees: {
    [LABELS.SWAP_FEES]: "Trading fees paid directly by users on Yaka V2 swaps.",
  },
  Revenue: {
    [LABELS.SWAP_FEES_TO_PROTOCOL]: "12% of trading fees kept by Yaka.",
    [LABELS.SWAP_FEES_TO_VEYAKA]: "88% of trading fees paid to veYAKA holders.",
  },
  ProtocolRevenue: {
    [LABELS.SWAP_FEES_TO_PROTOCOL]: "12% of trading fees kept by Yaka.",
  },
  HoldersRevenue: {
    [LABELS.SWAP_FEES_TO_VEYAKA]: "88% of trading fees paid to veYAKA holders.",
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
