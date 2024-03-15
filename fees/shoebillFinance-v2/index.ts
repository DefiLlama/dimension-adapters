import { Adapter, ChainBlocks, FetchOptions, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getFees } from "../../helpers/compoundV2";

const unitrollers = {
  [CHAIN.MANTA]: [
    '0x9f53Cd350c3aC49cE6CE673abff647E5fe79A3CC', // eth
    '0x3413Dc597aE3bE40C6f10fC3D706b884eaCF470A', // stable
  ],
  [CHAIN.WEMIX]: [
    '0xBA5E3f89f57342D94333C682e159e68Ee1Fc64De' // wemix
  ]
}

const fetch: any = async (timestamp: number, chainBlocks: ChainBlocks, options: FetchOptions): Promise<FetchResultFees> => {
  const { chain, createBalances, } = options
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  for (const market of unitrollers[chain]) {
    await getFees(market, options, { dailyFees, dailyRevenue, abis: { reserveFactor: "uint256:reserveFactorMantissa", } });
  }
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
