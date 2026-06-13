import * as sdk from "@defillama/sdk";
import { Chain, FetchOptions } from "../adapters/types";
import BigNumber from "bignumber.js";
import request, { gql } from "graphql-request";
import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

interface IPoolData {
  id: number;
  feesUSD: string;
}

type IURL = {
  [l: string | Chain]: string;
}

const endpoints: IURL = {
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('7StqFFqbxi3jcN5C9YxhRiTxQM8HA8XEHopsynqqxw3t'),
  [CHAIN.BASE]: sdk.graph.modifyEndpoint('C8G1vfqsgWTg4ydzxWdsLj1jCKsxAKFamP5GjuSdRF8W'),
  [CHAIN.OPTIMISM]: sdk.graph.modifyEndpoint('HCThb3gJC45qUYmNEaYmZZTqJW3pSq7X6tb4MqNHEvZf'),
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('ALCsbp7jWC6EQjwgicvZkG6dDEFGMV32QUZJvJGqL9Kx'),
  [CHAIN.SONIC]: sdk.graph.modifyEndpoint('6m7Dp7MFFLW1V7csgeBxqm9khNkfbn2U9qgADSdECfMA'),
  [CHAIN.FANTOM]: sdk.graph.modifyEndpoint('HDNu25S2uqr13BHrQdPv2PfTpwxJgPB7QEnC8fsgKcM9')
}

const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
    const dateId = Math.floor(getTimestampAtStartOfDayUTC(options.startOfDay) / 86400)
    const graphQuery = gql
      `
      {
        solidlyDayData(id: ${dateId}) {
          id
          feesUSD
        }
      }
    `;

    const graphRes: IPoolData = (await request(endpoints[options.chain], graphQuery))
      .solidlyDayData
    const dailyFeeUSD = graphRes
    const dailyFee = dailyFeeUSD?.feesUSD
      ? new BigNumber(dailyFeeUSD.feesUSD)
      : undefined
    if (dailyFee === undefined) return {}

    return {
      dailyFees: dailyFee.toString(),
      dailyUserFees: dailyFee.toString(),
      dailyRevenue: dailyFee.times(0.2).toString(),
      dailyHoldersRevenue: dailyFee.times(0.2).toString(),
      dailySupplySideRevenue: dailyFee.times(0.8).toString(),
    }
  }

const methodology = {
        Fees: "Fees paid by users for swaps on Solidly V3 pools.",
        UserFees: "User pays fees on each swap.",
        Revenue: '20% of the fees are distributed to voters using veSOLID.',
        SupplySideRevenue: '80% of the fees are distributed to liquidity providers, along with emissions of the SOLID token.',
      }

const adapter: Adapter = {
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: {
      start: '2023-08-18',
    },
    [CHAIN.SONIC]: {
      start: '2024-12-17',
    },
    [CHAIN.BASE]: {
      start: '2024-01-24',
    },
    [CHAIN.OPTIMISM]: {
      start: '2024-01-24',
    },
    [CHAIN.ARBITRUM]: {
      start: '2024-01-24',
    },
    [CHAIN.FANTOM]: {
      start: '2023-12-25',
    }
  }, 
  methodology,
}

export default adapter;
