import { Adapter, BreakdownAdapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import { getBlock } from "../helpers/getBlock";
import BigNumber from "bignumber.js";
import { getPrices } from "../utils/prices";
import { Chain } from "@defillama/sdk/build/general";


interface IEvent {
  name: string;
  topic: string;
}
const event: IEvent[] = [
  {
    name: 'DevGovFeeCharged(address indexed trader, uint valueUsdc)',
    topic: '0x4628f3d38f72d5f9e077d3965e10cd3242ff1316aa2bf81f054c0dfb25408406'
  },
  {
    name: 'SssFeeCharged(address indexed trader, uint valueUsdc)',
    topic: '0xd1e388cc27c5125a80cf538c12b26dc5a784071d324a81a736e4d17f238588e4'
  },
  {
    name: 'ReferralFeeCharged(address indexed trader, uint valueUsdc)',
    topic: '0x0f5273269f52308b9c40fafda3ca13cc42f715fcd795365e87f351f59e249313'
  },
  {
    name: 'UsdcVaultFeeCharged(address indexed trader, uint valueUsdc)',
    topic: '0x8e8e632c3a076f70e7ef29ecf97a7363c57c48b744e1bafe2f8099ec5677c208'
  }
];

interface ITx {
  data: string;
}

const FEE_ADDRESS_V1 = {
  [CHAIN.ERA]: "0xE95a6FCC476Dc306749c2Ac62fB4637c27ac578d",
};
const FEE_ADDRESS = {
  [CHAIN.ERA]: "0x50853A14cD14CC6A891BF034A204A15d294AF056",
  [CHAIN.ARBITRUM]: "0x8d85f4615ea5F2Ea8D91C196aaD4C04D8416865C",
};

const BIG_TEN = new BigNumber('10');

const USDC_DECIMAL = 6

const fetch = (address: string, chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
    const yesterdaysTimestamp = getTimestampAtStartOfNextDayUTC(timestamp)

    const todaysBlock = (await getBlock(todaysTimestamp, chain, {}));
    const yesterdaysBlock = (await getBlock(yesterdaysTimestamp, chain, {}));
    const [devFeeCall, ssFeeCall, referralFeeCall, nftBotFeeCall]: any = await Promise.all(
      event.map((e: IEvent) => sdk.api.util.getLogs({
        target: address,
        topic: e.name,
        toBlock: yesterdaysBlock,
        fromBlock: todaysBlock,
        keys: [],
        chain: chain,
        topics: [e.topic]
      })));
    const devFeeValume = devFeeCall.output.map((p: ITx) => new BigNumber(p.data)).reduce((a: BigNumber, c: BigNumber) => a.plus(c), new BigNumber('0'));
    const ssFeeVol = ssFeeCall.output.map((p: ITx) => new BigNumber(p.data)).reduce((a: BigNumber, c: BigNumber) => a.plus(c), new BigNumber('0'));
    const referralFeeVol = referralFeeCall.output.map((p: ITx) => new BigNumber(p.data)).reduce((a: BigNumber, c: BigNumber) => a.plus(c), new BigNumber('0'));
    const usdcVaultFeeVol = nftBotFeeCall.output.map((p: ITx) => new BigNumber(p.data)).reduce((a: BigNumber, c: BigNumber) => a.plus(c), new BigNumber('0'));
    const prices = await getPrices(['coingecko:usdc'], todaysTimestamp);
    const usdcPrice = prices['coingecko:usdc']?.price || 1;
    const dailyRevenue = devFeeValume.plus(ssFeeVol).times(usdcPrice).div(BIG_TEN.pow(USDC_DECIMAL)).toString();
    const dailyFees = devFeeValume.plus(ssFeeVol).plus(referralFeeVol).plus(usdcVaultFeeVol).times(usdcPrice).div(BIG_TEN.pow(USDC_DECIMAL)).toString();
    return {
      timestamp,
      dailyFees,
      dailyRevenue,
      dailyHoldersRevenue: dailyRevenue,
    } as FetchResultFees
  }
}

const adapter: BreakdownAdapter = {
  breakdown: {
    v1: {
      [CHAIN.ERA]: {
        fetch: fetch(FEE_ADDRESS_V1[CHAIN.ERA], CHAIN.ERA),
        start: async () => 1690761600, // 2023/07/31 00:00:00
      }
    },
    v2: {
      [CHAIN.ERA]: {
        fetch: fetch(FEE_ADDRESS[CHAIN.ERA], CHAIN.ERA),
        start: async () => 1698883200, // 2023/11/02 00:00:00
      },
      [CHAIN.ARBITRUM]: {
        fetch: fetch(FEE_ADDRESS[CHAIN.ARBITRUM], CHAIN.ARBITRUM),
        start: async () => 1698883200, // 2023/11/02 00:00:00
      },
    },
  },
};

export default adapter;
