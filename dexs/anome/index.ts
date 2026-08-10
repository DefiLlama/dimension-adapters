import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const MARKET_CONTRACT = "0x210d75B7C94aDf9FC1a2bCd047D76890479234e3"; 
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TRANSFER_EVENT = "event Transfer(address indexed from, address indexed to, uint256 value)";

const topic0_address = (address: string) => "0x000000000000000000000000" + address.toLowerCase().replace('0x', '');

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs } = options;
  const dailyVolume = createBalances();

  // 1. Buy: User transfers USDT to Market (Inflow)
  const logsIn = await getLogs({
    target: BSC_USDT,
    topics: [TRANSFER_TOPIC, null as any, topic0_address(MARKET_CONTRACT)],
    eventAbi: TRANSFER_EVENT,
    onlyArgs: true,
  });

  // 2. Sell: Market transfers USDT to User (Outflow)
  const logsOut = await getLogs({
    target: BSC_USDT,
    topics: [TRANSFER_TOPIC, topic0_address(MARKET_CONTRACT), null as any],
    eventAbi: TRANSFER_EVENT,
    onlyArgs: true,
  });

  // 3. Aggregate total volume
  logsIn.forEach((log: any) => dailyVolume.add(BSC_USDT, log.value));
  logsOut.forEach((log: any) => dailyVolume.add(BSC_USDT, log.value));

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BSC],
  start: '2025-10-25', 
};

export default adapter;