import { CHAIN } from "../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import fetchURL from "../utils/fetchURL";
import { Adapter, FetchResultFees } from "../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphFees";

const poolsDataEndpoint = "https://explorer.interoperability.institute/graphql?query=query%20DailyStatisticsByChain(%24chainID%3A%20Int%2C%20%24type%3A%20DailyStatisticType%2C%20%24duration%3A%20Duration%2C%20%24useCache%3A%20Boolean%2C%20%24platform%3A%20Platform%2C%20%24useMv%3A%20Boolean)%20%7B%0A%20%20dailyStatisticsByChain(%0A%20%20%20%20chainID%3A%20%24chainID%0A%20%20%20%20type%3A%20%24type%0A%20%20%20%20duration%3A%20%24duration%0A%20%20%20%20useCache%3A%20%24useCache%0A%20%20%20%20platform%3A%20%24platform%0A%20%20%20%20useMv%3A%20%24useMv%0A%20%20)%20%7B%0A%20%20%20%20date%0A%20%20%20%20ethereum%0A%20%20%20%20optimism%0A%20%20%20%20cronos%0A%20%20%20%20bsc%0A%20%20%20%20polygon%0A%20%20%20%20fantom%0A%20%20%20%20boba%0A%20%20%20%20metis%0A%20%20%20%20moonbeam%0A%20%20%20%20moonriver%0A%20%20%20%20klaytn%0A%20%20%20%20arbitrum%0A%20%20%20%20avalanche%0A%20%20%20%20dfk%0A%20%20%20%20aurora%0A%20%20%20%20harmony%0A%20%20%20%20canto%0A%20%20%20%20dogechain%0A%20%20%20%20total%0A%20%20%20%20__typename%0A%20%20%7D%0A%7D&operationName=DailyStatisticsByChain&variables=%7B%22type%22%3A%22FEE%22%2C%22duration%22%3A%22PAST_6_MONTHS%22%2C%22platform%22%3A%22ALL%22%2C%22useCache%22%3Atrue%2C%22useMv%22%3Atrue%7D"

type TChains = {
  [chain: string | Chain]: string;
}
const chains: TChains = {
  [CHAIN.ETHEREUM]:"ethereum",
  [CHAIN.OPTIMISM]:"optimism",
  [CHAIN.CRONOS]:"cronos",
  [CHAIN.BSC]:"bsc",
  [CHAIN.POLYGON]:"polygon",
  [CHAIN.FANTOM]:"fantom",
  [CHAIN.BOBA]:"boba",
  [CHAIN.METIS]:"metis",
  [CHAIN.MOONBEAM]:"moonbeam",
  [CHAIN.MOONRIVER]:"moonriver",
  [CHAIN.KLAYTN]:"klaytn",
  [CHAIN.ARBITRUM]:"arbitrum",
  [CHAIN.AVAX]:"avalanche",
  [CHAIN.DFK]:"dfk",
  [CHAIN.AURORA]:"aurora",
  [CHAIN.HARMONY]:"harmony",
  [CHAIN.CANTO]:"canto",
  [CHAIN.DOGECHAIN]:"dogechain",
};

interface IHistory {
  [s: string]: number | string;
}

const graphs = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    const historical: IHistory[] = (await fetchURL(poolsDataEndpoint))?.data.data.dailyStatisticsByChain;
    const historicalVolume = historical
    const date = new Date(timestamp * 1000);
    const dateStr = date.toISOString().split('T')[0];
    const totalFees = historicalVolume
      .filter(volItem => (new Date(volItem.date).getTime() / 1000) <= dayTimestamp)
      .reduce((acc,  b: IHistory) => acc + Number(b[chains[chain]]), 0)
    const dailyFees = historicalVolume
      .find(dayItem => dayItem.date  === dateStr)?.[chains[chain]]

    if (dailyFees === undefined) return {} as FetchResultFees;

    return {
      timestamp,
      dailyFees: dailyFees?.toString(),
      dailyRevenue: dailyFees.toString(),
      dailyUserFees: dailyFees?.toString(),
      totalFees: totalFees.toString(),
      totalUserFees: totalFees.toString(),
      totalRevenue: totalFees.toString(),

    };
  };
};

const methodology = {
  UserFees: "Bridge fees paid by users",
  Fees: "Bridge fees paid by users",
  Revenue: "Bridge fees that goes to the protocol"
}

const adapter: Adapter = {
  adapter: Object.keys(chains).reduce((acc, chain: any) => {
    return {
      ...acc,
      [chain]: {
        fetch: graphs(chain as Chain),
        start: async () => 1664323200,
        meta: {
          methodology
        }
      }
    }
  }, {})
}

export default adapter;
