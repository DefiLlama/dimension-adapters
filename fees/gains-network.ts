import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import { getBlock } from "../helpers/getBlock";
import BigNumber from "bignumber.js";


interface IEvent {
  name: string;
  topic: string;
}
const event: IEvent[] = [
  {
    name: 'DevGovFeeCharged(uint valueDai)',
    topic: '0x94bf664d3924a5d5d3e71ee53c5bdcce866ec4b43c54db2cd179f3473790920d'
  },
  {
    name: 'SssFeeCharged(uint valueDai)',
    topic: '0x3788d58fa410ec2544131c6c383109bca0ba17fb72096a3f77581aba0e454228'
  },
  {
    name: 'ReferralFeeCharged(uint valueDai)',
    topic: '0x146e3fd3726924a61f7680adc15e73436f5e17a023460d5fc860dd9abce05c8f'
  },
  {
    name: 'NftBotFeeCharged(uint valueDai)',
    topic: '0x14f8be3132e5b96272e03b3f1bf63723d335360268f02c28c75808359d70490b'
  },
  {
    name: 'DaiVaultFeeCharged(uint valueDai)',
    topic: '0x5d2a90b1b3edfd2a9bea268b669e9d44c0a8d46b9f593cdd25ed986aefa2ae99'
  },
  {
    name: 'LpFeeCharged(uint valueDai)',
    topic: '0xc476668ed4772e5ad97cf622f4fa0e63e9671e7d9e169ee746432fdb21bc42b2'
  }
];

interface ITx {
  data: string;
}

const FEE_ADDRESS = "0x6805dD635AA542210ed572F7b93121002c629690";
const BIG_TEN = new BigNumber('10');
const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
  const yesterdaysTimestamp = getTimestampAtStartOfNextDayUTC(timestamp)

  const todaysBlock = (await getBlock(todaysTimestamp, "polygon", {}));
  const yesterdaysBlock = (await getBlock(yesterdaysTimestamp, "polygon", {}));
  const [devFeeCall, ssFeeCall, referralFeeCall, nftBotFeeCall, daiVaultCall, lpFeeCall]: any = await Promise.all(
    event.map((e:IEvent) => sdk.api.util.getLogs({
      target: FEE_ADDRESS,
      topic: e.name,
      toBlock: yesterdaysBlock,
      fromBlock: todaysBlock,
      keys: [],
      chain: "polygon",
      topics: [e.topic]
  })))
  const devFeeValume = devFeeCall.output.map((p: ITx) => new BigNumber(p.data)).reduce((a: BigNumber, c: BigNumber) => a.plus(c), new BigNumber('0'));
  const ssFeeVol = ssFeeCall.output.map((p: ITx) => new BigNumber(p.data)).reduce((a: BigNumber, c: BigNumber) => a.plus(c), new BigNumber('0'));
  const referralFeeVol = referralFeeCall.output.map((p: ITx) => new BigNumber(p.data)).reduce((a: BigNumber, c: BigNumber) => a.plus(c), new BigNumber('0'));
  const nftBotFeeVol = nftBotFeeCall.output.map((p: ITx) => new BigNumber(p.data)).reduce((a: BigNumber, c: BigNumber) => a.plus(c), new BigNumber('0'));
  const daiVaultVol = daiVaultCall.output.map((p: ITx) => new BigNumber(p.data)).reduce((a: BigNumber, c: BigNumber) => a.plus(c), new BigNumber('0'));
  const lpFeeVol = lpFeeCall.output.map((p: ITx) => new BigNumber(p.data)).reduce((a: BigNumber, c: BigNumber) => a.plus(c), new BigNumber('0'));

  const dailyRevenue = devFeeValume.plus(ssFeeVol).div(BIG_TEN.pow(18)).toString();
  const dailyFees =  devFeeValume.plus(ssFeeVol).plus(referralFeeVol).plus(nftBotFeeVol).plus(daiVaultVol).plus(lpFeeVol).div(BIG_TEN.pow(18)).toString();
  return {
    timestamp,
    dailyFees,
    dailyRevenue
  } as FetchResultFees
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.POLYGON]: {
        fetch: fetch,
        start: async ()  => 1654214400,
    },
  }
}

export default adapter;
