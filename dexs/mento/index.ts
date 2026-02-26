import { FetchResult, SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const event_swap = 'event Swap( address exchangeProvider,bytes32 indexed exchangeId,address indexed trader,address indexed tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut)';

const contract_addresses: any = {
  [CHAIN.CELO]: '0x777a8255ca72412f0d706dc03c9d1987306b4cad'
}


const fetchVolume = async (options: FetchOptions) => {
  const logs = await options.getLogs({
    target: contract_addresses[options.chain],
    eventAbi: event_swap,
  })
  const dailyVolume = options.createBalances();

  logs.forEach((log) => {
    dailyVolume.add(log.tokenOut, log.amountOut);
  })
  return { dailyVolume }
}

const adapters: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.CELO]: {
      fetch: fetchVolume,
    }
  }
}

export default adapters;
