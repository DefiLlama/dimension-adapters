import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

const routers = ["0x160141A205F5dDcf096BA3F48B7eD21EB52c62EA", "0xdB13ad0fcD134E9c48f2fDaEa8f6751a0F5349ca"]
const swapEvent = 'event Swap(address indexed sender, address indexed srcToken, address indexed destToken, uint256 srcAmount, uint256 destAmount)'

async function fetch(options: FetchOptions) {
  const { getLogs, createBalances } = options;
  const dailyVolume = createBalances();
  const logs = await getLogs({ targets: routers, eventAbi: swapEvent });
  logs.forEach((log: any) => {
    addOneToken({
        chain: options.chain, 
        balances: dailyVolume, 
        token0: log.srcToken, 
        amount0: log.srcAmount, 
        token1: log.destToken, 
        amount1: log.destAmount 
    })
  });
  return { dailyVolume };
}

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    pullHourly: true,
    chains: [CHAIN.ETHEREUM],
    start: "2026-05-12",
};

export default adapter;
