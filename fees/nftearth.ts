import ADDRESSES from '../helpers/coreAssets.json'
import { Adapter, ChainBlocks, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import * as sdk from "@defillama/sdk";
import { getPrices } from "../utils/prices";
import { getBlock } from "../helpers/getBlock";
import { Chain } from "@defillama/sdk/build/general";

const topic0 = '0x9d9af8e38d66c62e2c12f0225249fd9d721c54b83f48d9352c97c6cacdcb6f31';

type TMarketPlaceAddress = {
  [l: string | Chain]: string;
}
const marketplace_address: TMarketPlaceAddress = {
  [CHAIN.OPTIMISM]: '0x0f9b80fc3c8b9123d0aef43df58ebdbc034a8901',
  [CHAIN.ARBITRUM]: '0x0f9b80fc3c8b9123d0aef43df58ebdbc034a8901',
  [CHAIN.POLYGON]: '0x0f9b80fc3c8b9123d0aef43df58ebdbc034a8901'
}

interface ITx {
  data: string;
  transactionHash: string;
}

interface ISaleData {
  contract_address: string;
  amount: number;
  creator_fee: number;
  marketplace_fee: number;
}
const event_order_fulfilled = "event OrderFulfilled(bytes32 orderHash, address indexed offerer, address indexed zone, address recipient, (uint8 itemType, address token, uint256 identifier, uint256 amount)[] offer, (uint8 itemType, address token, uint256 identifier, uint256 amount, address recipient)[] consideration)"


const fetch = (_chain: Chain) => {
  return async (timestamp: number, _: ChainBlocks, _options: FetchOptions): Promise<FetchResultFees> => {
    // project is dead
    // TODO: add project dead flag
    return { dailyFees: '0', dailyRevenue: '0', timestamp }

    /* const dailyFees = createBalances()
    const dailyRevenue = createBalances()

    const logs= await getLogs({
      target: marketplace_address[chain],
      topics: [topic0],
    })

    logs.map((tx: any) => {
      const postionPayableToken = Number(tx.data.slice(320, 384)) === 1 ? 6 : 11;
      const address = tx.data.slice(postionPayableToken*64, (postionPayableToken*64)+64); // 11
      const contract_address = '0x' + address.slice(24, address.length);
      const creator_fee =  Number('0x' + tx.data.slice(1152, 1216)) // 18
      const marketplace_fee =  Number('0x' + tx.data.slice(1472, 1536))// 23
      dailyFees.add(contract_address, creator_fee)
      dailyFees.add(contract_address, marketplace_fee)
      dailyRevenue.add(contract_address, marketplace_fee)

    });

    return {
      dailyFees: dailyFees.toString(),
      dailyRevenue: dailyRevenue.toString(),
      timestamp
    }*/
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: 1675036800,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: 1676332800,
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(CHAIN.POLYGON),
      start: 1675036800,
    },
  }
}

export default adapter;
