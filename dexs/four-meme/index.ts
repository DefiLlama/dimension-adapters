import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

const address = '0x5c952063c7fc8610ffdb798152d69f0b9550762b'
const topics0_buy = '0x7db52723a3b2cdd6164364b3b766e65e540d7be48ffa89582956d8eaebe62942';
const topics0_sell_1 = '0x0a5575b3648bae2210cee56bf33254cc1ddfbc7bf637c0af2ac18b14fb1bae19';



const fetchVolume = async (options: FetchOptions) => {
  const buy_logs: any[] = await options.getLogs({
    target: address,
    topics: [topics0_buy],
  })

  const sell_logs_1: any[] = await options.getLogs({
    target: address,
    topics: [topics0_sell_1],
  })

  const dailyVolume = options.createBalances()
  buy_logs.concat(sell_logs_1).forEach((log) => {
    const data = log.data.replace('0x', '');
    const amount = Number('0x' + data.slice(4 * 64, 5 * 64))
    if (amount/1e18 < 100) dailyVolume.addGasToken(amount)
  });
  return {
    dailyVolume: dailyVolume
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetchVolume,
      start: 1735129946,
    },
  },
}

export default adapter
