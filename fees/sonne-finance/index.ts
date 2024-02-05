import { Adapter, ChainBlocks, FetchOptions, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {
  getAllMarkets,
  getMarketDetails,
  getVeloGaugeDetails,
} from "./helpers";
import { CTokenABI } from "./_abi";
import { IAccrueInterestLog, IContext } from "./_types";

const unitroller = "0x60CF091cD3f50420d50fD7f707414d0DF4751C58";
const veloGauge = "0x3786d4419d6b4a902607ceb2bb319bb336735df8";
const veloToken = "0x3c8b650257cfb5f272f799f5e2b4e65093a11a05";
const veVeloHolder = "0x17063ad4e83b0aba4ca0f3fc3a9794e807a00ed7";

const getContext = async ({ api }: FetchOptions): Promise<IContext> => {
  const allMarketAddressess = await getAllMarkets(unitroller, api);
  const { underlyings, reserveFactors } = await getMarketDetails(allMarketAddressess, api);

  return {
    markets: allMarketAddressess,
    underlyings,
    reserveFactors,
  };
};

const getDailyProtocolFees = async ({
  markets,
  underlyings,
  reserveFactors,
}: IContext, { getLogs, createBalances, }: FetchOptions) => {
  let dailyFees = createBalances();
  let dailyRevenue = createBalances();
  const logs: IAccrueInterestLog[] = (await getLogs({
    targets: markets,
    eventAbi: CTokenABI.accrueInterest,
    flatten: false,
  })).map((log: any, index: number) => {
    return log.map((i: any) => ({
      ...i,
      interestAccumulated: Number(i.interestAccumulated),
      marketIndex: index,
    }));
  }).flat()

  logs.forEach((log: any) => {
    const marketIndex = log.marketIndex;
    const underlying = underlyings[marketIndex].toLowerCase();
    dailyFees.add(underlying, log.interestAccumulated);
    dailyRevenue.add(underlying, log.interestAccumulated * Number(reserveFactors[marketIndex]) / 1e18);
  });

  return { dailyFees, dailyRevenue, };
};

const getDailyVeloRewards = async ({ api, fromTimestamp, toTimestamp, createBalances }: FetchOptions) => {
  const balances = createBalances();
  const { lastEarn, earned } = await getVeloGaugeDetails(veloGauge, veloToken, veVeloHolder, api,);

  const timespan = toTimestamp - fromTimestamp;
  const earnedTimespan = toTimestamp - lastEarn;
  const ratio = timespan / earnedTimespan;
  balances.add(veloToken, earned * ratio);
  return balances
};

const fetch = async (timestamp: number, chainBlocks: ChainBlocks, options: FetchOptions): Promise<FetchResultFees> => {
  const context = await getContext(options);
  const { dailyFees, dailyRevenue } = await getDailyProtocolFees(context, options);
  const dailyHoldersRevenue = await getDailyVeloRewards(options)
  dailyHoldersRevenue.addBalances(dailyRevenue)

  return { timestamp, dailyFees, dailyRevenue, dailyHoldersRevenue, };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: fetch as any,
      start: 1664582400,
    },
  },
};

export default adapter;
