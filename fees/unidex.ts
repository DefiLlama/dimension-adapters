import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { Chain } from "@defillama/sdk/build/general";
import request, { gql } from "graphql-request";
import { getPrices } from "../utils/prices";

type TUrl = {
  [l: string | Chain]: string;
}
const endpoints: TUrl = {
  [CHAIN.OPTIMISM]: 'https://api.thegraph.com/subgraphs/name/unidex-finance/optimismleveragev2',
  [CHAIN.ERA]: 'https://zksync.tempsubgraph.xyz/subgraphs/name/unidex-finance/zkssyncleveragev2',
  [CHAIN.FANTOM]: 'https://api.thegraph.com/subgraphs/name/unidex-finance/fantomleveragev2',
  [CHAIN.METIS]: 'https://unidexcronos.xyz/subgraphs/name/unidex-finance/leveragev2',
  [CHAIN.ARBITRUM]: 'https://api.thegraph.com/subgraphs/name/unidex-finance/arbitrumleveragev2',
}

interface IDTrade {
  id: string; // Add this line
  cumulativeFees: string;
}

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);

    // Define token Ids based on the chain
    let tokenIds: string[] = [];
    switch (chain) {
      case CHAIN.FANTOM:
        tokenIds = [
          "fantom:0x0000000000000000000000000000000000000000",
          "fantom:0x04068da6c83afcfa0e13ba15a6696662335d5b75",
          "fantom:0x21be370d5312f44cb42ce377bc9b8a0cef1a4c83",
        ];
        break;
      case CHAIN.ARBITRUM:
        tokenIds = [
          "arbitrum:0x0000000000000000000000000000000000000000",
          "arbitrum:0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f",
          "arbitrum:0xda10009cbd5d07dd0cecc66161fc93d7c9000da1",
          "arbitrum:0xff970a61a04b1ca14834a43f5de4533ebddb5cc8",
          "arbitrum:0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
          "arbitrum:0x912ce59144191c1204e64559fe8253a0e49e6548",
          "arbitrum:0xfea7a6a0b346362bf88a9e4a88416b77a57d6c2a",
          "arbitrum:0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a",
          "arbitrum:0xd85e038593d7a098614721eae955ec2022b9b91b",
          "arbitrum:0x5979D7b546E38E414F7E9822514be443A4800529",
          "arbitrum:0x3f56e0c36d275367b8c502090edf38289b3dea0d",
          "arbitrum:0x18c11FD286C5EC11c3b683Caa813B77f5163A122",
          "arbitrum:0xaaa6c1e32c55a7bfa8066a6fae9b42650f262418",
          "arbitrum:0x031d35296154279dc1984dcd93e392b1f946737b",
          "arbitrum:0x0Ae38f7E10A43B5b2fB064B42a2f4514cbA909ef",
        ];
        break;
      // Add cases for other chains if needed
    }

    // Fetch prices for the defined token Ids
    const prices = await getPrices(tokenIds, timestamp);

    const graphQuery = gql`
      {
        dayDatas(where:{ date: "${todaysTimestamp}"}) {
          id
          cumulativeFees
        }
      }
    `;

    const graphRes: IDTrade[] = (await request(endpoints[chain], graphQuery)).dayDatas;

    let dailyFeeUSD = 0;
    graphRes.forEach((trade) => {
      const tokenId = trade.id.split('-')[0]; // Extract the token address part
      const tokenPriceKey = chain.toLowerCase() + ":" + tokenId; // Construct the key for fetching the price
      const tokenPrice = prices[tokenPriceKey]?.price || 1;
      const dailyFee = Number(trade.cumulativeFees || 0) / 10 ** 8;
      dailyFeeUSD += dailyFee * tokenPrice; // Convert to USD
    });

    const dailyHoldersRevenue = dailyFeeUSD * 0.35;
    const dailyProtocolRevenue = dailyFeeUSD * 0.70;
    const dailySupplySideRevenue = dailyFeeUSD * 0.3;
    return {
      dailyFees: dailyFeeUSD.toString(),
      dailyHoldersRevenue: dailyHoldersRevenue.toString(),
      dailyProtocolRevenue: dailyProtocolRevenue.toString(),
      dailyRevenue: dailyProtocolRevenue.toString(),
      dailySupplySideRevenue: dailySupplySideRevenue.toString(),
      timestamp
    };
  };
};

const methodology = {
  Fees: "Fees collected from user trading fees",
  Revenue: "Fees going to the treasury + holders",
  HoldersRevenue: "Fees going to token holders",
  SupplySideRevenue: "Fees going to liquidity providers of counter party pools"
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.OPTIMISM]: {
        fetch: fetch(CHAIN.OPTIMISM),
        start: async ()  => 1687422746,
        meta: {
          methodology
        }
    },
    [CHAIN.ERA]: {
      fetch: fetch(CHAIN.ERA),
      start: async ()  => 1687422746,
      meta: {
        methodology
      }
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: async ()  => 1687422746,
      meta: {
        methodology
      }
    },
    [CHAIN.FANTOM]: {
      fetch: fetch(CHAIN.FANTOM),
      start: async ()  => 1687422746,
      meta: {
        methodology
      }
    },
    [CHAIN.METIS]: {
      fetch: fetch(CHAIN.METIS),
      start: async ()  => 1687898060,
      meta: {
        methodology
      }
    },
  }
}

export default adapter;
