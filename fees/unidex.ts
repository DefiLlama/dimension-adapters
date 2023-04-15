// trade
// 0x21366a8960fd8f761b7596170f16bcfc1be8b8d6 op
// event
// 0x722a60bf2980ad6565c04c8210c55454af895983660b33099a60a0af5e05037b PositionUpdated
// - currency index[0]
// - fees index[5]
// 0x1eba783f67334e9b95080299c6a95635568b5bf34dbe80586bc9f938307d7b9c ClosePosition
// - currency index[0]
// - fees index[5]
// 0x1eba783f67334e9b95080299c6a95635568b5bf34dbe80586bc9f938307d7b9c liq
// - currency index[0]
// - wasLiquidated index[1]
// - fees index[5]
// aggetor
// 0x103d0634ec6c9e1f633381b16f8e2fe56a2e7372 (arb/fantom)
// event
// 0xa07a543ab8a018198e99ca0184c93fe9050a79400a0a723441f84de1d972cc17
// - sell token index[0]
// - fees index[4]

import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import * as sdk from "@defillama/sdk";
import { getPrices } from "../utils/prices";
import { getBlock } from "../helpers/getBlock";
import { Chain } from "@defillama/sdk/build/general";

const topic0 = '0x31d8f0f884ca359b1c76fda3fd0e25e5f67c2a5082158630f6f3900cb27de467';
const topic0_position_updated = '0x722a60bf2980ad6565c04c8210c55454af895983660b33099a60a0af5e05037b';
type TAddress = {
  [l: string | Chain]: string;
}
const address: TAddress = {
  [CHAIN.OPTIMISM]: '0x21366a8960fd8f761b7596170f16bcfc1be8b8d6',
}

interface ITx {
  data: string;
  transactionHash: string;
}

interface IDTrade {
  currency: string;
  fees_usd: number;
}

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
    const yesterdaysTimestamp = getTimestampAtStartOfNextDayUTC(timestamp)

    const fromBlock = (await getBlock(todaysTimestamp, chain, {}));
    const toBlock = (await getBlock(yesterdaysTimestamp, chain, {}));
    const logs: ITx[] = (await sdk.api.util.getLogs({
      target: address[chain],
      topic: '',
      fromBlock: fromBlock,
      toBlock: toBlock,
      topics: [topic0_position_updated],
      keys: [],
      chain: chain
    })).output.map((e: any) => { return { data: e.data.replace('0x', ''), transactionHash: e.transactionHash } as ITx});

    const raw_logs_position_update: IDTrade[] = logs.map((tx: ITx) => {
      const fees_usd = Number('0x' + tx.data.slice(320, 384)) / 10 ** 8;
      const address = tx.data.slice(0, 64);
      const currency = '0x' + address.slice(24, address.length);
      return {
        currency: currency,
        fees_usd: fees_usd,
      }
    });
    console.log(raw_logs_position_update)

    // const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
    // const ethPrice = (await getPrices([ethAddress], timestamp))[ethAddress].price;
    // const marketplace_fee = rawLogsData.reduce((a: number, b: ISaleData) => a+b.marketplace_fee, 0);
    // const creator_fee = rawLogsData.reduce((a: number, b: ISaleData) => a+b.creator_fee, 0);
    // const dailyFees = (marketplace_fee + creator_fee) * ethPrice;
    // const dailyRevenue = (marketplace_fee) * ethPrice;
    return {
      dailyFees: '0',
      dailyRevenue: '0',
      timestamp
    }
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.OPTIMISM]: {
        fetch: fetch(CHAIN.OPTIMISM),
        start: async ()  => 1675382400,
    },
  }
}

export default adapter;
