import * as sdk from "@defillama/sdk";
import { Adapter, ChainBlocks, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getPrices } from "../../utils/prices";
import { getBlock } from "../../helpers/getBlock";
import { ethers } from "ethers";
import {
  getAllMarkets,
  getAllMarketsMulti,
  getMarketDetails,
} from "./helpers";
import { cTokenInterface } from "./_abi";
import { IAccrueInterestLog, IContext } from "./_types";


const unitrollers = {
  [CHAIN.MANTA] : [
    '0x9f53Cd350c3aC49cE6CE673abff647E5fe79A3CC', // eth
    '0x3413Dc597aE3bE40C6f10fC3D706b884eaCF470A', // stable
  ],
  [CHAIN.WEMIX]: [
    '0xBA5E3f89f57342D94333C682e159e68Ee1Fc64De' // wemix
  ]
}

interface ITx {
  data: string;
  topics: string[];
}

const getContext = async (timestamp: number, _: ChainBlocks, chain: keyof typeof unitrollers): Promise<IContext> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  const fromBlock = (await getBlock(fromTimestamp, chain, {}));
  const toBlock = (await getBlock(toTimestamp, chain, {}));



  const allMarketAddressess = await getAllMarketsMulti(unitrollers[chain], chain);
  const { underlyings, reserveFactors } = await getMarketDetails(
    allMarketAddressess,
    chain
  );

  const prices = await getPrices(
    [
      ...underlyings.map((x: string) => `${chain}:${x.toLowerCase()}`),
    ],
    timestamp
  );

  return {
    currentTimestamp: timestamp,
    startTimestamp: fromTimestamp,
    endTimestamp: toTimestamp,
    startBlock: fromBlock,
    endBlock: toBlock,
    markets: allMarketAddressess,
    underlyings,
    reserveFactors,
    prices,
    chain,
  };
};

const getDailyProtocolFees = async ({
  markets,
  underlyings,
  reserveFactors,
  prices,
  startBlock,
  endBlock,
  chain,
}: IContext) => {
  let dailyProtocolFees = 0;
  let dailyProtocolRevenue = 0;
  const logs: IAccrueInterestLog[] = (await Promise.all(
    markets.map((address: string) => sdk.api.util.getLogs({
      target: address,
      topic: '',
      toBlock: endBlock,
      fromBlock: startBlock,
      keys: [],
      chain: chain,
      topics: ['0x4dec04e750ca11537cabcd8a9eab06494de08da3735bc8871cd41250e190bc04']
  })))).map((e: any) => e.output.map((p: any) => {
    return {...p} as ITx
  })).flat()
  .map((log: any) => {
    const x =  cTokenInterface.parseLog(log);
    return {
      market: log.address,
      cashPrior: x.args.cashPrior,
      interestAccumulated: x.args.interestAccumulated,
      borrowIndexNew: x.args.borrowIndexNew,
      totalBorrowsNew: x.args.totalBorrowsNew,
    }
  });

  logs.forEach((log: IAccrueInterestLog) => {
    const marketIndex = markets.indexOf(log.market);
    const underlying = underlyings[marketIndex].toLowerCase();
    const price = prices[`${chain}:${underlying.toLowerCase()}`];

    const interestTokens = +ethers.utils.formatUnits(
      log.interestAccumulated,
      price?.decimals || 0
    );
    const reserveFactor = +ethers.utils.formatUnits(
      reserveFactors[marketIndex],
      18
    );
    const interestUSD = interestTokens * price?.price || 0;
    dailyProtocolFees += interestUSD;
    dailyProtocolRevenue += interestUSD * reserveFactor;
  });

  return {
    dailyProtocolFees,
    dailyProtocolRevenue,
  };
};


const fetchManta = async (timestamp: number, chainBlocks: ChainBlocks): Promise<FetchResultFees> => {
  const context = await getContext(timestamp, chainBlocks, CHAIN.MANTA);

  const { dailyProtocolFees, dailyProtocolRevenue } = await getDailyProtocolFees(context);


  return {
    timestamp,
    dailyFees: dailyProtocolFees.toString(),
    dailyRevenue: dailyProtocolRevenue.toString(),
    dailyHoldersRevenue: (dailyProtocolRevenue).toString(),
  };
};

const fetchWEMIX = async (timestamp: number, chainBlocks: ChainBlocks): Promise<FetchResultFees> => {
  const context = await getContext(timestamp, chainBlocks, CHAIN.WEMIX);

  const { dailyProtocolFees, dailyProtocolRevenue } = await getDailyProtocolFees(context);


  return {
    timestamp,
    dailyFees: dailyProtocolFees.toString(),
    dailyRevenue: dailyProtocolRevenue.toString(),
    dailyHoldersRevenue: (dailyProtocolRevenue).toString(),
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.MANTA]: {
      fetch: fetchManta,
      start: async () => 1703980800,
      runAtCurrTime: true,
    },
    [CHAIN.WEMIX]: {
      fetch: fetchWEMIX,
      start: async () => 1703980800 ,
      runAtCurrTime: true,
    }
  },
};

export default adapter;
