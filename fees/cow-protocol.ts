import ADDRESSES from '../helpers/coreAssets.json'
import { Adapter, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain, } from "@defillama/sdk/build/general";
import { queryIndexer } from "../helpers/indexer";

type TAddress = {
  [l: string | Chain]: string;
}
const address: TAddress = {
  [CHAIN.ETHEREUM]: '0x9008d19f58aabd9ed0d60971565aa8510560ab41',
  [CHAIN.XDAI]: '0x9008d19f58aabd9ed0d60971565aa8510560ab41'
}


const fetch = (chain: Chain) => {
  return async (timestamp: number, _: any, options: FetchOptions): Promise<FetchResultFees> => {
    const logs = await options.getLogs({
      target: address[chain],
      eventAbi: "event Trade (address indexed owner, address sellToken, address buyToken, uint256 sellAmount, uint256 buyAmount, uint256 feeAmount, bytes orderUid)",
    })
    const dailyFees = options.createBalances();
    logs.map((tx: any) => dailyFees.add(tx.sellToken, tx.feeAmount))
    const dailyRevenue = dailyFees.clone()
    if (chain === CHAIN.ETHEREUM) {
      const gasUsed = await queryIndexer(`
            SELECT
              COUNT(ethereum.event_logs.transaction_hash) as _count,
              ethereum.transactions.gas_used * ethereum.transactions.gas_price AS sum
            FROM
              ethereum.event_logs
              INNER JOIN ethereum.blocks ON ethereum.event_logs.block_number = ethereum.blocks.number
              INNER JOIN ethereum.transactions on ethereum.event_logs.transaction_hash = ethereum.transactions.hash
            WHERE
              ethereum.event_logs.contract_address = '\\x9008d19f58aabd9ed0d60971565aa8510560ab41'
              AND ethereum.event_logs.topic_0 = '\\xed99827efb37016f2275f98c4bcf71c7551c75d59e9b450f79fa32e60be672c2'
              AND success = TRUE
              AND ethereum.event_logs.block_time BETWEEN llama_replace_date_range
              GROUP by sum`, options);

      gasUsed.map((e: any) => dailyRevenue.add(ADDRESSES.ethereum.WETH, e.sum * -1 / e._count))
    }

    return { dailyUserFees: dailyFees, dailyFees, dailyRevenue, timestamp }
  }
}

const methodology = {
  UserFees: "Trading fees",
  Fees: "Trading fees",
  Revenue: "Trading fees - transation fees",
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch(CHAIN.ETHEREUM) as any,
      start: 1675382400,
      meta: {
        methodology
      }
    },
    // [CHAIN.XDAI]: {
    //   fetch: fetch(CHAIN.XDAI) as any,
    //   start: 1675382400,
    //   meta: {
    //     methodology
    //   }
    // }
  }
}

export default adapter;
