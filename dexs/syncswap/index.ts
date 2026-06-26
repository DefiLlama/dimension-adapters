import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";

const endpoints: { [key: string]: string } = {
  [CHAIN.ERA]: 'https://graph1.syncswap.xyz/subgraphs/name/syncswap/syncswap-zksync',
  [CHAIN.LINEA]: 'https://graph1.syncswap.xyz/subgraphs/name/syncswap/syncswap-linea',
  [CHAIN.SCROLL]: 'https://graph1.syncswap.xyz/subgraphs/name/syncswap/syncswap-scroll',
  [CHAIN.SOPHON]: 'https://graph1.syncswap.xyz/subgraphs/name/syncswap/syncswap-sophon',
};

const headers = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
  'origin': 'https://syncswap.xyz',
};
const FEE_DENOMINATOR = 100_000;
const MAX_SWAP_FEE = 10_000; // SyncSwap docs: fee values are 6-decimal uint24; max swap fee is 10%.
const PAGE_SIZE = 1000;
const PAIR_BATCH_SIZE = 50; // Subgraph fails on large id_in lists.

async function fetch(options: FetchOptions) {
  const endpoint = endpoints[options.chain];
  const defaultFeesQuery = gql`
    {
      defaultFeeDatas {
        id
        minFee
        maxFee
        protocolFee
      }
    }
  `
  const pairDayDataQuery = gql`
    query GetPairDayData($date: Int!, $skip: Int!) {
      pairDayDatas(
        first: ${PAGE_SIZE}
        skip: $skip
        orderBy: pairAddress
        orderDirection: asc
        where: { date: $date }
      ) {
        pairAddress
        dailyVolumeUSD
      }
    }
  `

  const { defaultFeeDatas } = await request(endpoint, defaultFeesQuery, undefined, headers);
  const defaultFees = Object.fromEntries(defaultFeeDatas.map((i: any) => [i.id, i]));
  const pairDayDatas: any[] = [];
  for (let skip = 0; ; skip += PAGE_SIZE) {
    const { pairDayDatas: page } = await request(endpoint, pairDayDataQuery, { date: options.startOfDay, skip }, headers);
    pairDayDatas.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  const pairsQuery = gql`
    query GetPairs($ids: [ID!]) {
      pairs(first: ${PAIR_BATCH_SIZE}, where: { id_in: $ids }) {
        id
        poolType
        swapFee01Min
        swapFee01Max
        swapFee10Min
        swapFee10Max
        protocolFee
      }
    }
  `
  const pairConfigs: any = {};
  const pairIds = [...new Set(pairDayDatas.map(i => i.pairAddress.toLowerCase()))];
  for (let i = 0; i < pairIds.length; i += PAIR_BATCH_SIZE) {
    const { pairs } = await request(endpoint, pairsQuery, { ids: pairIds.slice(i, i + PAIR_BATCH_SIZE) }, headers);
    pairs.forEach((i: any) => pairConfigs[i.id.toLowerCase()] = i);
  }

  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  pairDayDatas.forEach(i => {
    const pair = pairConfigs[i.pairAddress.toLowerCase()];
    const fee = [pair.swapFee01Min, pair.swapFee01Max, pair.swapFee10Min, pair.swapFee10Max].map(Number);
    const defaultFee = defaultFees[pair.poolType];
    const swapFee = Math.max(...fee) <= MAX_SWAP_FEE ? fee.reduce((sum, fee) => sum + fee, 0) / fee.length : (Number(defaultFee.minFee) + Number(defaultFee.maxFee)) / 2;
    const fees = Number(i.dailyVolumeUSD) * swapFee / FEE_DENOMINATOR;
    const revenue = fees * Number(pair.protocolFee ?? defaultFee.protocolFee) / FEE_DENOMINATOR;
    dailyVolume.addUSDValue(Number(i.dailyVolumeUSD));
    dailyFees.addUSDValue(fees);
    dailyRevenue.addUSDValue(revenue);
  });
  const dailySupplySideRevenue = dailyFees.clone()
  dailySupplySideRevenue.subtract(dailyRevenue)

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Volume: "Count token swap volume from SyncSwap subgraphs.",
  Fees: "Swap fees paid by users, calculated from each pool's daily volume and fee configuration in the SyncSwap subgraphs.",
  UserFees: "Users pay fees for every swap on SyncSwap.",
  Revenue: "Protocol share of swap fees, calculated from each pool's protocol fee configuration.",
  ProtocolRevenue: "Protocol share of swap fees, calculated from each pool's protocol fee configuration.",
  SupplySideRevenue: "LP share of swap fees after the protocol share.",
}

const adapter: SimpleAdapter = {
  methodology,
  version: 1,
  fetch,
  adapter: {
    [CHAIN.ERA]: {
      start: '2024-03-06',
    },
    [CHAIN.LINEA]: {
      start: '2024-03-06',
    },
    [CHAIN.SCROLL]: {
      start: '2024-03-06',
    },
    [CHAIN.SOPHON]: {
      start: '2024-12-17',
    },
  }
}

export default adapter
