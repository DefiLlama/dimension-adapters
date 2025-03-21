import * as sdk from '@defillama/sdk';
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const address = '0x5c952063c7fc8610ffdb798152d69f0b9550762b'
const topics0_buy = '0x7db52723a3b2cdd6164364b3b766e65e540d7be48ffa89582956d8eaebe62942';
const topics0_sell_1 = '0x0a5575b3648bae2210cee56bf33254cc1ddfbc7bf637c0af2ac18b14fb1bae19';

async function fetchVolumeFromIndexers(params: { target: string; options: FetchOptions, topics: string[] }) {
  let { target, options, topics } = params;

  const batchSize = 1000;
  const allLogs: any[] = [];
  let offset = 0;
  let batchLogs: any[];

  for (;;) {
    batchLogs = await sdk.indexer.getLogs({
      chain: options.chain,
      target,
      topics,
      onlyArgs: true,
      // ~~ 150 confirmation block lag L1 ( < 10 blocks for L2)
      fromBlock: (await options.getFromBlock()) - 200,
      toBlock: (await options.getToBlock()) - 200,
      limit: batchSize,
      offset,
      all: false
    });
    allLogs.push(...batchLogs);
    if (batchLogs.length < batchSize) break;
    offset += batchSize;
  }

  return allLogs
}

const fetchVolume = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const buy_logs: any[] = await fetchVolumeFromIndexers({ target: address, topics: [topics0_buy], options })
  const sell_logs_1: any[] = await fetchVolumeFromIndexers({ target: address, topics: [topics0_sell_1], options })

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
  isExpensiveAdapter: true,
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetchVolume,
      start: 1735129946,
    },
  },
}

export default adapter
