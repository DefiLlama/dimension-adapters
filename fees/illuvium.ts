import { Adapter, FetchOptions, } from '../adapters/types';
import { CHAIN } from '../helpers/chains';

const fetchFees = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  let transfers = [] as any[]
  let cursor = ""
  do {
    const url = `https://api.immutable.com/v1/transfers?receiver=0x2208850ea5569617d5350f8cf681031102c1d931&max_timestamp=${new Date(options.endTimestamp * 1e3).toISOString()}&min_timestamp=${new Date(options.startTimestamp * 1e3).toISOString()}&cursor=${cursor}`
    const data = await fetch(url).then(r => r.json())
    transfers = transfers.concat(data.result)
    cursor = data.cursor
  } while (cursor !== "")

  transfers.forEach(transfer => {
    if (transfer.token.type === "ETH") {
      dailyFees.addCGToken("ethereum", transfer.token.data.quantity / 1e18)
    }
  })
  return {
    dailyFees,
    dailyRevenue: dailyFees,
  }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.IMMUTABLEX]: {
      fetch: fetchFees,
    },
  },
  methodology: {
    Fees: "ETH paid to purchase fuel",
    Revenue: "ETH paid to purchase fuel",
  }
}

export default adapter;
