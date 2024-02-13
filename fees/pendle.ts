import { ChainBlocks, FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import request from "graphql-request";
import { addTokensReceived } from '../helpers/token';

type IConfig = {
  [s: string | Chain]: {
    endpoint: string;
    treasury: string;
  };
}

const gqlQuery = `
  {
    assets(first: 1000, where: {
      type_in: ["SY"]
    }) {
      id,
      type
    }
  }
`

const chainConfig: IConfig = {
  [CHAIN.ETHEREUM]: {
    endpoint: 'https://api.thegraph.com/subgraphs/name/pendle-finance/core-mainnet-23-dec-18',
    treasury: '0x8270400d528c34e1596ef367eedec99080a1b592'
  },
  [CHAIN.ARBITRUM]: {
    endpoint: 'https://api.thegraph.com/subgraphs/name/pendle-finance/core-arbitrum-23-dec-18',
    treasury: '0xcbcb48e22622a3778b6f14c2f5d258ba026b05e6',
  },
  [CHAIN.BSC]: {
    endpoint: 'https://api.thegraph.com/subgraphs/name/pendle-finance/core-bsc-23-dec-18',
    treasury: '0xd77e9062c6df3f2d1cb5bf45855fa1e7712a059e',
  },
  [CHAIN.OPTIMISM]: {
    endpoint: 'https://api.thegraph.com/subgraphs/name/pendle-finance/core-optimism-23-dec-18',
    treasury: '0xe972d450ec5b11b99d97760422e0e054afbc8042',
  }
}

const fetch = (chain: Chain) => {
  return async (timestamp: number, _: ChainBlocks, options: FetchOptions): Promise<FetchResultFees> => {
    const { api } = options
    const allSy: string[] = (await request(chainConfig[chain].endpoint, gqlQuery)).assets.filter((token: any) => token.type === 'SY').map((token: any) => token.id.toLowerCase())
    const rewardTokens: string[] = (await api.multiCall({ permitFailure: true, abi: getRewardTokensABI, calls: allSy })).flat()
    const dailyFees = await addTokensReceived({ options, target: chainConfig[chain].treasury, tokens: rewardTokens.concat(allSy) })
    const dailyRevenue = dailyFees.clone(0.3)
    const dailySupplySideRevenue = dailyFees.clone(0.7)


    return {
      dailyFees: dailyFees,
      dailyRevenue: dailyFees,
      dailyHoldersRevenue: dailyRevenue,
      dailySupplySideRevenue: dailySupplySideRevenue,
      timestamp
    }
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch(CHAIN.ETHEREUM),
      start: 1686268800,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: 1686268800,
    },
    [CHAIN.BSC]: {
      fetch: fetch(CHAIN.BSC),
      start: 1686268800,
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: 1691733600,
    }
  }
};

const getRewardTokensABI = "address[]:getRewardTokens"

export default adapter;
