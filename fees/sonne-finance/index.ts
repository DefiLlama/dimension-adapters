import * as sdk from "@defillama/sdk";
import { Adapter, ChainBlocks, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getPrices } from "../../utils/prices";
import { getBlock } from "../../helpers/getBlock";
import { ethers } from "ethers";
import {
  getAllMarkets,
  getMarketDetails,
  getVeloGaugeDetails,
} from "./helpers";
import { cTokenInterface } from "./_abi";
import { IAccrueInterestLog, IContext } from "./_types";

const unitroller = "0x60CF091cD3f50420d50fD7f707414d0DF4751C58";
const veloGauge = "0x3786d4419d6b4a902607ceb2bb319bb336735df8";
const veloToken = "0x3c8b650257cfb5f272f799f5e2b4e65093a11a05";
const veVeloHolder = "0x17063ad4e83b0aba4ca0f3fc3a9794e807a00ed7";

interface ITx {
  data: string;
  topics: string[];
}

const getContext = async (timestamp: number, _: ChainBlocks): Promise<IContext> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  const fromBlock = (await getBlock(fromTimestamp, CHAIN.OPTIMISM, {}));
  const toBlock = (await getBlock(toTimestamp, CHAIN.OPTIMISM, {}));

  const allMarketAddressess = await getAllMarkets(unitroller, CHAIN.OPTIMISM);
  const { underlyings, reserveFactors } = await getMarketDetails(
    allMarketAddressess,
    CHAIN.OPTIMISM
  );

  const prices = await getPrices(
    [
      ...underlyings.map((x: string) => `${CHAIN.OPTIMISM}:${x.toLowerCase()}`),
      `${CHAIN.OPTIMISM}:${veloToken.toLowerCase()}`,
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
  };
};

const getDailyProtocolFees = async ({
  markets,
  underlyings,
  reserveFactors,
  prices,
  startBlock,
  endBlock,
}: IContext) => {
  let dailyProtocolFees = 0;
  let dailyProtocolRevenue = 0;
  const logs: IAccrueInterestLog[] = (await Promise.all(
    markets.map((address: string) => sdk.getEventLogs({
      target: address,
      toBlock: endBlock,
      fromBlock: startBlock,
      chain: CHAIN.OPTIMISM,
      topics: ['0x4dec04e750ca11537cabcd8a9eab06494de08da3735bc8871cd41250e190bc04']
  })))).map((e: any) => e.map((p: any) => {
    return {...p} as ITx
  })).flat()
  .map((log: any) => {
    const x =  cTokenInterface.parseLog(log);
    return {
      market: log.address,
      cashPrior: x!.args.cashPrior,
      interestAccumulated: x!.args.interestAccumulated,
      borrowIndexNew: x!.args.borrowIndexNew,
      totalBorrowsNew: x!.args.totalBorrowsNew,
    }
  });

  logs.forEach((log: IAccrueInterestLog) => {
    const marketIndex = markets.findIndex((e: string) => e.toLowerCase() === log.market.toLowerCase());
    const underlying = underlyings[marketIndex].toLowerCase();
    const price = prices[`${CHAIN.OPTIMISM}:${underlying.toLowerCase()}`];

    const interestTokens = +ethers.formatUnits(
      log.interestAccumulated,
      price?.decimals || 0
    );
    const reserveFactor = +ethers.formatUnits(
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

const getDailyVeloRewards = async (context: IContext) => {
  const {
    currentTimestamp,
    startTimestamp,
    endTimestamp,
    prices,
  } = context;

  const { lastEarn, earned } = await getVeloGaugeDetails(
    veloGauge,
    veloToken,
    veVeloHolder,
    CHAIN.OPTIMISM,
  );

  const timespan = endTimestamp - startTimestamp;
  const earnedTimespan = currentTimestamp - lastEarn;
  const ratio = timespan / earnedTimespan;

  const priceVelo = prices[`${CHAIN.OPTIMISM}:${veloToken}`];
  const earnedTokens = +ethers.formatUnits(earned, priceVelo.decimals);
  const todayEarnedTokens = earnedTokens * ratio;
  const todayEarnedUSD = todayEarnedTokens * priceVelo.price;

  return todayEarnedUSD;
};

const fetch = async (timestamp: number, chainBlocks: ChainBlocks): Promise<FetchResultFees> => {
  const context = await getContext(timestamp, chainBlocks);

  const { dailyProtocolFees, dailyProtocolRevenue } = await getDailyProtocolFees(context);

  const dailyVeloRewards = await getDailyVeloRewards(context);

  return {
    timestamp,
    dailyFees: dailyProtocolFees.toString(),
    dailyRevenue: dailyProtocolRevenue.toString(),
    dailyHoldersRevenue: (dailyProtocolRevenue + dailyVeloRewards).toString(),
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: fetch,
      start: async () => 1664582400,
      // runAtCurrTime: true,
    },
  },
};

export default adapter;
