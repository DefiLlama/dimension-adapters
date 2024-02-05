import { Adapter, ChainBlocks, FetchOptions, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getAllMarketsMulti, getMarketDetails, } from "./helpers";

const unitrollers = {
  [CHAIN.MANTA]: [
    '0x9f53Cd350c3aC49cE6CE673abff647E5fe79A3CC', // eth
    '0x3413Dc597aE3bE40C6f10fC3D706b884eaCF470A', // stable
  ],
  [CHAIN.WEMIX]: [
    '0xBA5E3f89f57342D94333C682e159e68Ee1Fc64De' // wemix
  ]
}

type IMapToken = {
  [key: string]: string;
};
const baseToken: IMapToken = {
  [CHAIN.MANTA]: '0x0dc808adce2099a9f62aa87d9670745aba741746',
  [CHAIN.WEMIX]: '0x7D72b22a74A216Af4a002a1095C8C707d6eC1C5f'
}

const fetch: any = async (timestamp: number, chainBlocks: ChainBlocks, { api, chain, createBalances, getLogs, }: FetchOptions): Promise<FetchResultFees> => {

  const markets = await getAllMarketsMulti(unitrollers[chain], api);
  const { underlyings, reserveFactors } = await getMarketDetails(markets, api);

  let dailyFees = createBalances()
  let dailyRevenue = createBalances()
  const logs: any[] = (await getLogs({
    targets: markets,
    flatten: false,
    eventAbi: "event AccrueInterest(uint256 cashPrior,uint256 interestAccumulated,uint256 borrowIndex,uint256 totalBorrows)"
  })).map((log: any, index: number) => {
    return log.map((i: any) => ({
      ...i,
      interestAccumulated: Number(i.interestAccumulated),
      marketIndex: index,
    }));
  }).flat()

  logs.forEach((log: any) => {
    const marketIndex = log.marketIndex;
    const underlying = underlyings[marketIndex] ?? baseToken[chain]
    dailyFees.add(underlying, log.interestAccumulated);
    dailyRevenue.add(underlying, log.interestAccumulated * Number(reserveFactors[marketIndex]) / 1e18);
  })

  return { timestamp, dailyFees, dailyRevenue, dailyHoldersRevenue: dailyRevenue, };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.MANTA]: {
      fetch,
      start: 1703980800,
      runAtCurrTime: true,
    },
    [CHAIN.WEMIX]: {
      fetch,
      start: 1703980800,
      runAtCurrTime: true,
    }
  },
};

export default adapter;
