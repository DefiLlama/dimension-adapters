import { Adapter, FetchResultFees } from "../adapters/types";
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
    name: 'DevGovFeeCharged(address indexed trader, uint valueDai)',
    topic: '0x4628f3d38f72d5f9e077d3965e10cd3242ff1316aa2bf81f054c0dfb25408406'
  },
  {
    name: 'SssFeeCharged(address indexed trader, uint valueDai)',
    topic: '0xd1e388cc27c5125a80cf538c12b26dc5a784071d324a81a736e4d17f238588e4'
  },
  {
    name: 'ReferralFeeCharged(address indexed trader, uint valueDai)',
    topic: '0x0f5273269f52308b9c40fafda3ca13cc42f715fcd795365e87f351f59e249313'
  },
  {
    name: 'NftBotFeeCharged(address indexed trader, uint valueDai)',
    topic: '0xcada75418f444febbe725c87360b063440c54e00e82d578010de1ed009d756c5'
  },
  {
    name: 'DaiVaultFeeCharged(address indexed trader, uint valueDai)',
    topic: '0x60c73da98faf96842eabd77a0c73964cd189dbaf2c9ae90923a3fed137f30e3e'
  },
  {
    name: 'LpFeeCharged(address indexed trader, uint valueDai)',
    topic: '0xf3dd1b8102b506743ce65a97636e91051e861f4f8f7e3eb87f2d95d0a616cea2'
  }
];

interface ITx {
  data: string;
}

const FEE_ADDRESS_POLYGON = "0xb454d8A8C98035C65Bb73FE2a11567b9B044E0fa";
const FEE_ADDRESS_ARBITRUM = "0x6C612C804c84e3D20E3109c8efD06cD2d8b28F46";
const FEE_ADDRESS = {
  [CHAIN.POLYGON]: FEE_ADDRESS_POLYGON,
  [CHAIN.ARBITRUM]: FEE_ADDRESS_ARBITRUM
};

const BIG_TEN = new BigNumber('10');

const fetch = (address: string, chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
    const yesterdaysTimestamp = getTimestampAtStartOfNextDayUTC(timestamp)

    const todaysBlock = (await getBlock(todaysTimestamp, chain, {}));
    const yesterdaysBlock = (await getBlock(yesterdaysTimestamp, chain, {}));
    const [devFeeCall, ssFeeCall, referralFeeCall, nftBotFeeCall, daiVaultCall, lpFeeCall]: any = await Promise.all(
      event.map((e:IEvent) => sdk.api.util.getLogs({
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
    const nftBotFeeVol = nftBotFeeCall.output.map((p: ITx) => new BigNumber(p.data)).reduce((a: BigNumber, c: BigNumber) => a.plus(c), new BigNumber('0'));
    const daiVaultVol = daiVaultCall.output.map((p: ITx) => new BigNumber(p.data)).reduce((a: BigNumber, c: BigNumber) => a.plus(c), new BigNumber('0'));
    const lpFeeVol = lpFeeCall.output.map((p: ITx) => new BigNumber(p.data)).reduce((a: BigNumber, c: BigNumber) => a.plus(c), new BigNumber('0'));
    const prices = await getPrices(['coingecko:dai'], todaysTimestamp);
    const daiPrice = prices['coingecko:dai']?.price || 1;
    const dailyRevenue = devFeeValume.plus(ssFeeVol).times(daiPrice).div(BIG_TEN.pow(18)).toString();
    const dailyFees =  devFeeValume.plus(ssFeeVol).plus(referralFeeVol).plus(nftBotFeeVol).plus(daiVaultVol).plus(lpFeeVol).times(daiPrice).div(BIG_TEN.pow(18)).toString();
    return {
      timestamp,
      dailyFees,
      dailyRevenue,
      dailyHoldersRevenue: dailyRevenue,
    } as FetchResultFees
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.POLYGON]: {
        fetch: fetch(FEE_ADDRESS[CHAIN.POLYGON], CHAIN.POLYGON),
        start: async ()  => 1654214400,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(FEE_ADDRESS[CHAIN.ARBITRUM], CHAIN.ARBITRUM),
      start: async ()  => 1672358400,
  },
  }
}

export default adapter;
