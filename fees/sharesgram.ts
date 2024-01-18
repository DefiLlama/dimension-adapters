import { getBalance } from "@defillama/sdk/build/eth";
import { Adapter, ChainBlocks, FetchResultFees } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { getBlock } from "../helpers/getBlock";
import BigNumber from "bignumber.js";
import { getPrices } from "../utils/prices";


const holder_wallet_address = '0x6adfaef59fdd3522e8673d1a13418413beeeea57';
const protocol_wallet_address = '0xefb9a25a5d892bdf587103a226e6dd0369b220de';

const fetch = async (timestamp: number, chainBlocks: ChainBlocks): Promise<FetchResultFees> => {
  const toTimestamp = timestamp;
  const fromTimestamp = timestamp - 60 * 60 * 24
  try {
    const todaysBlock = (await getBlock(toTimestamp, CHAIN.BASE, chainBlocks));
    const yesterdaysBlock = (await getBlock(fromTimestamp, CHAIN.BASE, {}));

    const [
        holderBalanceStart,
        holderBalanceEnd,
        protocolBalanceStart,
        protocolBalanceEnd,
    ] = (await Promise.all([
        getBalance({
            target: holder_wallet_address,
            block: yesterdaysBlock,
            chain: CHAIN.BASE
        }),
        getBalance({
            target: holder_wallet_address,
            block: todaysBlock,
            chain: CHAIN.BASE
        }),
        getBalance({
            target: protocol_wallet_address,
            block: yesterdaysBlock,
            chain: CHAIN.BASE
        }),
        getBalance({
            target: protocol_wallet_address,
            block: todaysBlock,
            chain: CHAIN.BASE
        }),
    ])).map(i => i.output)
    const ethBalance = (new BigNumber(holderBalanceEnd).minus(holderBalanceStart))
      .plus((new BigNumber(protocolBalanceEnd).minus(protocolBalanceStart)))
    const fees: BigNumber = ethBalance.dividedBy(10**18)
    const dailyFee: number = fees.dividedBy(.7).toNumber()
    const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
    const pricesObj: any = await getPrices([ethAddress], toTimestamp);
    const latestPrice = pricesObj[ethAddress]["price"]
    const dailyFees = dailyFee * latestPrice;
    const dailyRevenue = dailyFees * .7;
    const dailyHolderRev = dailyFees * .5;
    const dailyProtocolRevenue = dailyFees * .2;
    return {
      dailyFees: dailyFees.toString(),
      dailyRevenue: dailyRevenue.toString(),
      dailyProtocolRevenue: dailyProtocolRevenue.toString(),
      dailyHoldersRevenue: dailyHolderRev.toString(),
      timestamp
    }
  } catch (e) {
    console.error(e)
    throw e;
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: async () => 1693180800
    }
  }
}
export default adapter;
