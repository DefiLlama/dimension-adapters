import { Fetch, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";
import {CHAIN} from "../../helpers/chains";

const POOL_CREATE = 'event PairCreated(address indexed token0, address indexed token1, address pair, uint256)';
const SWAP_EVENT = 'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)';

const factory: {[chain: string]: string} = {
  [CHAIN.BSC]: '0x03879e2a3944fd601e7638dfcbc9253fb793b599',
  [CHAIN.ANCIENT8]: '0xAE12C5930881c53715B369ceC7606B70d8EB229f',
  [CHAIN.BITKUB]: '0xf7eEe3A8363731C611A24CdDfCBcaDE9C153Cfe8',
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
    [CHAIN.BSC]: {
      fetch: graphs,
      start: '2023-08-12',
    },
    [CHAIN.ANCIENT8]: {
      fetch: graphs,
      start: '2023-08-12',  
    },
    [CHAIN.BITKUB]: {
      fetch: graphs,
      start: '2023-08-12',  
    },
  },
};

export default adapter;