import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';

// Upgradeable Monad mainnet pool; logs are emitted by this proxy across upgrades.
// Deployment and ABI: https://github.com/thogard785/thog-amm-integration-guide
const THOGAMM = '0x80c74517BCC2D67fFE02D3ED886796272F647210';
const SWAP_EVENT = 'event MakerSwapExecuted(address indexed tokenIn, address indexed tokenOut, address indexed sender, address recipient, uint256 amountIn, uint256 amountOut, uint256 quoteAgeBlocks, uint256 inventoryPenaltyUsdWad)';

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const swaps = await options.getLogs({ target: THOGAMM, eventAbi: SWAP_EVENT });

  for (const swap of swaps) {
    // Actual input received by the pool, in raw token units; count each swap once.
    dailyVolume.add(swap.tokenIn, swap.amountIn);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.MONAD],
  fetch,
  methodology: {
    Volume: 'USD value of the input tokens received in settled ThogAMM swaps, counting each swap once and excluding liquidity transfers, lending activity and the operator’s trades on other venues.',
  },
};

export default adapter;
