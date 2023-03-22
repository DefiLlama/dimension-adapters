import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import { Chain } from "@defillama/sdk/build/general";
import request, { gql } from "graphql-request";
import { getPrices } from "../utils/prices";
import { type } from "os";
import fetchURL from "../utils/fetchURL";


const feesMMURL = "https://api.paraswap.io/stk/volume-stats/breakdown-by-chain";
type TChainId = {
  [l: string | Chain]: string;
}
const mapChainId: TChainId = {
  [CHAIN.ETHEREUM]: '1',
  [CHAIN.POLYGON]: '137',
  [CHAIN.BSC]: '56',
  [CHAIN.AVAX]: '43114',
  [CHAIN.FANTOM]: '250',
  [CHAIN.ARBITRUM]: '42161',
  [CHAIN.OPTIMISM]: '10',
}

type TUrl = {
  [l: string | Chain]: string;
}
const endpoints: TUrl = {
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/paraswap/paraswap-subgraph",
  [CHAIN.POLYGON]: "https://api.thegraph.com/subgraphs/name/paraswap/paraswap-subgraph-polygon",
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/paraswap/paraswap-subgraph-bsc",
  [CHAIN.AVAX]: "https://api.thegraph.com/subgraphs/name/paraswap/paraswap-subgraph-avalanche",
  [CHAIN.FANTOM]: "https://api.thegraph.com/subgraphs/name/paraswap/paraswap-subgraph-fantom",
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/paraswap/paraswap-subgraph-arbitrum",
  [CHAIN.OPTIMISM]: "https://api.thegraph.com/subgraphs/name/paraswap/paraswap-subgraph-optimism",
}
const swapQuery = gql`
  query swaps($timestampFrom: Int!, $timestampTo: Int!) {
    swaps(
      first: 1000
      orderBy: timestamp
      orderDirection: asc
      where: { timestamp_gt: $timestampFrom, timestamp_lt: $timestampTo, paraswapFee_not: "0" }
    ) {
      feeToken
      paraswapFee
      referrerFee
    }
  }
`;



interface IFees {
  feeToken: string;
  paraswapFee: string;
  referrerFee: string;
}

interface IAmount {
  paraswapFeeUSD: number;
  referrerFeeUSD: number;
}

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const timestampFrom = getTimestampAtStartOfDayUTC(timestamp)
    const timestampTo = getTimestampAtStartOfNextDayUTC(timestamp)
    const result: IFees[] = (await request(endpoints[chain], swapQuery, {
      timestampFrom: timestampFrom,
      timestampTo: timestampTo,
    })).swaps;
    const mmFees: any[] = (await fetchURL(feesMMURL)).data.daily;
    const [_, partnerRevenue, protocolRevenue]: number[] = mmFees.filter(([time]: any) => time === timestampFrom)
      .map(([_, data]: any) => data[mapChainId[chain]]).flat()
    const otherFees = partnerRevenue + protocolRevenue;
    const otherProtocolReveune = protocolRevenue;
    const tokens: string[] = result.map((e: IFees) => `ethereum:${e.feeToken}`)
    const prices = await getPrices(tokens, timestamp);
    const feesAmounts: IAmount[] = result.map((e: IFees) => {
      const price = prices[`ethereum:${e.feeToken.toLowerCase()}`]?.price || 0;
      const decimals = prices[`ethereum:${e.feeToken.toLowerCase()}`]?.decimals || 0;
      const paraswapFee = (Number(e.referrerFee) / 10 ** decimals)  * price;
      const referrerFee = (Number(e.referrerFee) / 10 ** decimals) * price;
      return {
        paraswapFeeUSD: paraswapFee,
        referrerFeeUSD: referrerFee,
      };
    })
    const dailyFees = feesAmounts.reduce((a: number, b: IAmount) => a + b.paraswapFeeUSD + b.referrerFeeUSD, 0) + otherFees;
    const dailyRevenue = feesAmounts.reduce((a: number, b: IAmount) => a + b.paraswapFeeUSD, 0) + otherProtocolReveune;
    return {
      dailyFees: dailyFees.toString(),
      dailyRevenue: dailyRevenue.toString(),
      timestamp
    }
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
        fetch: fetch(CHAIN.ETHEREUM),
        start: async ()  => 1669852800,
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(CHAIN.POLYGON),
      start: async ()  => 1669852800,
    },
    [CHAIN.BSC]: {
      fetch: fetch(CHAIN.BSC),
      start: async ()  => 1669852800,
    },
    [CHAIN.AVAX]: {
      fetch: fetch(CHAIN.AVAX),
      start: async ()  => 1669852800,
    },
    [CHAIN.FANTOM]: {
      fetch: fetch(CHAIN.FANTOM),
      start: async ()  => 1669852800,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: async ()  => 1669852800,
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: async ()  => 1669852800,
    }
  }
}

export default adapter;
