import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const MARKET_CONTRACT = "0x210d75B7C94aDf9FC1a2bCd047D76890479234e3"; 
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const topic0_to = (address: string) => "0x000000000000000000000000" + address.slice(2).toLowerCase();

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs } = options;
  const dailyVolume = createBalances();

  // 1. Fetch inflow logs (User Buy: USDT -> Market)
  // Tracking transfers where Market Contract is the recipient (to)
  const logsIn = await getLogs({
    target: BSC_USDT,
    topic: TRANSFER_TOPIC,
    topics: [
        TRANSFER_TOPIC,             // from (any address)
        null as any,
        topic0_to(MARKET_CONTRACT)  // to (Market Contract)
    ], 
    eventAbi: 'event Transfer(address indexed from, address indexed to, uint256 value)',
    onlyArgs: true,
  });

  // 2. Fetch outflow logs (User Sell: Market -> USDT)
  // Tracking transfers where Market Contract is the sender (from)
  const logsOut = await getLogs({
    target: BSC_USDT,
    topic: TRANSFER_TOPIC,
    topics: [
        TRANSFER_TOPIC, 
        null as any,
        topic0_to(MARKET_CONTRACT), // from (Market Contract)
    ], 
    eventAbi: 'event Transfer(address indexed from, address indexed to, uint256 value)',
    onlyArgs: true,
  });

  // 3. Aggregate both buy and sell volumes into daily total
  logsIn.forEach((log: any) => dailyVolume.add(BSC_USDT, log.value));
  logsOut.forEach((log: any) => dailyVolume.add(BSC_USDT, log.value));

  return {
    dailyVolume: dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetch,
      start: async () => 0, 
    },
  },
};

export default adapter;