import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const factory = '0x4D1b18A7BDB8D0a02f692398337aBde8DeB8FB09';
const order_match_topic = '0x4a240ab8d1caf8cac694a7c49e539b9a8eab4fce50166482114055aa4e19a31b';
const order_match_event = 'event OrderMatched(address orderbook,uint256 id,bool isBid,address sender,address owner,uint256 price,uint256 amount)';

interface IPair {
  orderbook: string;
  base: string;
  quote: string;
  bDecimal: number;
  qDecimal: number;
}

const fetchVolune: FetchV2 = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const pairLogs = await options.getLogs({ target: factory, eventAbi: 'event PairAdded(address orderbook, address base, address quote, uint8 bDecimal, uint8 qDecimal)', onlyArgs: true, fromBlock: 4381503, cacheInCloud: true, })
  const pairs: IPair[] = pairLogs.map((log: any) => {
    return {
      orderbook: log.orderbook,
      base: log.base,
      quote: log.quote,
      bDecimal: log.bDecimal,
      qDecimal: log.qDecimal
    }
  })
  const logs_order_match = await options.getLogs({ target: factory, topics: [order_match_topic], eventAbi: order_match_event });
  logs_order_match.forEach((log: any) => {
    const pair = pairs.find((pair) => pair.orderbook.toLowerCase() === log.orderbook.toLowerCase());
    if (pair) {
      if (log.isBid) {
        dailyVolume.add(pair.quote, log.amount);
      } else {
        dailyVolume.add(pair.base, log.amount);
      }
    }
  });
  return { dailyVolume }
}


const options: any = { fetch: fetchVolune, start: '2024-02-27' }
const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.MODE]: options,
  },
  version: 2,
}

export default adapters;