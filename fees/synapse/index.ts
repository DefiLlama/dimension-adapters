import { CHAIN } from "../../helpers/chains";
import { Chain } from "../../adapters/types";
import { Adapter } from "../../adapters/types";
import request from "graphql-request";

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
  // [CHAIN.DOGECHAIN]:"dogechain",
  [CHAIN.BASE]: "base",
};

interface IHistory {
  [s: string]: number | string;
}
const url = 'https://explorer.omnirpc.io/graphql'
const query = `
{
  dailyStatisticsByChain(type:FEE, duration:PAST_6_MONTHS, useCache:true) {
    date
    ethereum
    optimism
    cronos
    bsc
    polygon
    fantom
    boba
    metis
    moonbeam
    moonriver
    klaytn
    arbitrum
    avalanche
    dfk
    aurora
    harmony
    canto
    dogechain
    base
    total
  }
}`


type IRequest = {
  [key: string]: Promise<any>;
}
const requests: IRequest = {}

export async function fetchrequest(url: string, query: string) {
  if (!requests[url])
    requests[url] = request(url, query)
  return requests[url]
}
const graphs = (chain: Chain) => {
  return async (timestamp: number) => {
    const historical: IHistory[] = (await fetchrequest(url, query)).dailyStatisticsByChain;
    // const historical: IHistory[] = require('./historical.json');
    const historicalVolume = historical
    const date = new Date(timestamp * 1000);
    const dateStr = date.toISOString().split('T')[0];
    const dailyFees = historicalVolume
      .find(dayItem => dayItem.date  === dateStr)?.[chains[chain]]

    return {
      timestamp,
      dailyFees,
      dailyRevenue: dailyFees,
      dailyUserFees: dailyFees,

    };
  };
};

const methodology = {
  UserFees: "Bridge fees paid by users",
  Fees: "Bridge fees paid by users",
  Revenue: "Bridge fees that goes to the protocol"
}

const adapter: Adapter = {
  version: 1,
  methodology,
  adapter: Object.keys(chains).reduce((acc, chain: any) => {
    return {
      ...acc,
      [chain]: {
        fetch: graphs(chain as Chain),
        start: '2021-08-21',
      }
    }
  }, {})
}
export default adapter;
