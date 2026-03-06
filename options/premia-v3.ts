import { SimpleAdapter, ChainEndpoints, FetchOptions, Chain } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import { getBlock } from "../helpers/getBlock";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

const v3Endpoints: ChainEndpoints = {
  [CHAIN.ARBITRUM]:
    "https://subgraph.satsuma-prod.com/5d8f840fce6d/premia/premia-v3-arbitrum/api",
}

const v3StartTimes: { [chain: string]: number } = {
  [CHAIN.ARBITRUM]: 1692576000,
}

async function getV3Data(url: string, timestamp: number, chain: Chain) {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const fromTimestamp = dayTimestamp - 60 * 60 * 24;
  const todayBlock = (await getBlock(dayTimestamp, chain, {}))
  const yesterdayBlock = (await getBlock(fromTimestamp, chain, {}))
  const query = gql`
  {
      today: factories(first: 1, block:{number: ${todayBlock}}) {
        volumeUSD
        premiumsUSD
      }
      yesterday: factories(first: 1, block:{number: ${yesterdayBlock}}) {
        volumeUSD
        premiumsUSD
      }
  }
  `
  const response: any = await request(url, query);
  const dailyPremiumVolume = (Number(response.today[0]?.premiumsUSD || '0') - Number(response.yesterday[0]?.premiumsUSD || '0')) / 1e18
  const dailyNotionalVolume = (Number(response.today[0]?.volumeUSD || '0') - Number(response.yesterday[0]?.volumeUSD || '0')) / 1e18

  return {
    timestamp,
    dailyNotionalVolume: dailyNotionalVolume < 0 ? undefined : dailyNotionalVolume,
    dailyPremiumVolume: dailyPremiumVolume < 0 ? undefined : dailyPremiumVolume,
  };
}

const adapter: SimpleAdapter = {
  methodology: {
    UserFees:
      "Traders pay taker fees on each trade up to 3% of the option premium.",
    ProtocolRevenue: "The protocol collects 10% of the taker fees.",
    SupplySideRevenue:
      "Liquidity providers collect 50% of the taker fees and earn revenue from market-making options.",
    HoldersRevenue: "vxPREMIA holders collect 40% of the taker fees.",
  },
  adapter: Object.keys(v3Endpoints).reduce((acc: any, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: async (_ts: number, _t: any, options: FetchOptions) =>
          await getV3Data(v3Endpoints[chain], options.startOfDay, chain),
        start: v3StartTimes[chain],
      },
    }
  }, {}),
}

export default adapter
