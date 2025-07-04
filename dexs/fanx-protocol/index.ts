import { Fetch, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";
import {CHAIN} from "../../helpers/chains";

const POOL_CREATE = 'event PairCreated(address indexed token0, address indexed token1, address pair, uint256)';
const SWAP_EVENT = 'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)';

const factory: {[chain: string]: string} = {
  [CHAIN.CHILIZ]: '0xE2918AA38088878546c1A18F2F9b1BC83297fdD3',
}

const graphs: Fetch = async (_timestamp: number, _t: any, options: FetchOptions) => {
      const adapter = getUniV2LogAdapter({ 
        factory: factory[options.chain as string], 
        eventAbi: SWAP_EVENT, 
        pairCreatedAbi: POOL_CREATE 
      });
      const v2stats = await adapter(options);

  return {
    timestamp: options.startOfDay,
    dailyVolume: v2stats?.dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.CHILIZ]: {
      fetch: graphs,
      start: '2024-04-01',
    },
  },
};

export default adapter;