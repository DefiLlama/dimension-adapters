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
  },
  {
    name: 'TriggerFeeCharged(address indexed trader, uint valueDai)',
    topic: '0x17fa86cf4833d28c6224a940e6bd001f2db0cb3d89d69727765679b3efee6559'
  },
  {
    name: 'GovFeeCharged(address indexed trader, uint valueDai, bool distributed)',
    topic: '0xccd80d359a6fbe0bfa5cbb1ecf0854adbe8c67b4ed6bf10d3c0d78c2be0f48cb'
  },
  {
    name: 'BorrowingFeeCharged(address indexed trader, uint tradeValueDai, uint feeValueDai)',
    topic: '0xe7d34775bf6fd7b34e703a903ef79ab16166ebdffce96a66f4d2f84b6263bb29'
  },
];

interface ITx {
  data: string;
}

const FEE_ADDRESS_POLYGON = "0x82e59334da8C667797009BBe82473B55c7A6b311";
const FEE_ADDRESS_ARBITRUM = "0x298a695906e16aeA0a184A2815A76eAd1a0b7522";
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
    const [devFeeCall, ssFeeCall, referralFeeCall, nftBotFeeCall, daiVaultCall, lpFeeCall, triggerFeeCall, govFeeCall, borrowingFeeCall]: any = await Promise.all(
      event.map((e:IEvent) => sdk.getEventLogs({
        target: address,
        topic: e.name,
        toBlock: yesterdaysBlock,
        fromBlock: todaysBlock,
        chain: chain,
        topics: [e.topic]
    })));

    const mapper = (p: ITx) => new BigNumber(p.data);
    const reducer = (a:BigNumber, c:BigNumber) => a.plus(c);
    const devFeeValume = devFeeCall.map(mapper).reduce(reducer, new BigNumber('0'));
    const ssFeeVol = ssFeeCall.map(mapper).reduce(reducer, new BigNumber('0'));
    const referralFeeVol = referralFeeCall.map(mapper).reduce(reducer, new BigNumber('0'));
    const nftBotFeeVol = nftBotFeeCall.map(mapper).reduce(reducer, new BigNumber('0'));
    const daiVaultVol = daiVaultCall.map(mapper).reduce(reducer, new BigNumber('0'));
    const lpFeeVol = lpFeeCall.map(mapper).reduce(reducer, new BigNumber('0'));
    const triggerFeeVol = triggerFeeCall.map(mapper).reduce(reducer, new BigNumber('0'));
    const govFeeVol = govFeeCall.map((p: ITx) => new BigNumber(p.data.slice(0, 66))).reduce(reducer, new BigNumber('0'));
    const borrowingFeeVol = borrowingFeeCall.map((p: ITx) => new BigNumber('0x' + p.data.slice(66, 130))).reduce(reducer, new BigNumber('0'));
    const prices = await getPrices(['coingecko:dai'], todaysTimestamp);
    const daiPrice = prices['coingecko:dai']?.price || 1;

    const dailyHoldersRevenue = ssFeeVol.times(daiPrice).div(BIG_TEN.pow(18)).toString();
    const dailyRevenue = devFeeValume.plus(ssFeeVol).plus(govFeeVol).times(daiPrice).div(BIG_TEN.pow(18)).toString();
    const dailyFees =  devFeeValume.plus(ssFeeVol).plus(govFeeVol).plus(referralFeeVol).plus(nftBotFeeVol).plus(daiVaultVol)
        .plus(lpFeeVol).plus(triggerFeeVol).plus(borrowingFeeVol).times(daiPrice).div(BIG_TEN.pow(18)).toString();

    return {
      timestamp,
      dailyFees,
      dailyRevenue,
      dailyHoldersRevenue,
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
