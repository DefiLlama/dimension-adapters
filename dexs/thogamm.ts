import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';

// Upgradeable Monad mainnet pool; logs are emitted by this proxy across upgrades.
// Deployment and ABI: https://github.com/thogard785/thog-amm-integration-guide
const THOGAMM = '0x80c74517BCC2D67fFE02D3ED886796272F647210';
const SWAP_EVENT = 'event MakerSwapExecuted(address indexed tokenIn, address indexed tokenOut, address indexed sender, address recipient, uint256 amountIn, uint256 amountOut, uint256 quoteAgeBlocks, uint256 inventoryPenaltyUsdWad)';

// Rebasing tokens traded by the pool. Source: https://github.com/thogard785/thog-amm-integration-guide/blob/main/THOGAMM_AGGREGATOR_INTEGRATION.md#listed-tokens
const xStocks: Record<string, string> = {
  '0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48': 'SPYx',
  '0xa753a7395cae905cd615da0b82a53e0560f250af': 'QQQx',
  '0x299c95eb52bfd5bc98d924bce17197b64864589b': 'EWYx',
  '0xc845b2894dbddd03858fd2d643b4ef725fe0849d': 'NVDAx',
  '0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0': 'TSLAx',
  '0x8d512a03600981b8e86556fd5c0fbdd726fe1821': 'SMHx',
  '0x68fa48b1c2fe52b3d776e1953e0e782b5044ce28': 'SPCXx',
  '0xf6a873bae4ba1b304e45df52a4b7d176e1c6a8c4': 'MUx',
  '0x58100046a4afcd4ee4fadbd4244f3f895a341c56': 'SKHYx',
  '0x909369940f22dc1c143ac78753a33f41597138b1': 'ANTx',
};
const stockCross = 'xStock to xStock';
const otherSpot = 'Other spot swaps';

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const swaps = await options.getLogs({ target: THOGAMM, eventAbi: SWAP_EVENT });

  for (const swap of swaps) {
    // Actual input received by the pool, in raw token units; count each swap once.
    const stockIn = xStocks[swap.tokenIn.toLowerCase()];
    const stockOut = xStocks[swap.tokenOut.toLowerCase()];
    const market = stockIn && stockOut ? stockCross : stockIn ?? stockOut ?? otherSpot;
    dailyVolume.add(swap.tokenIn, swap.amountIn, market);
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
  breakdownMethodology: {
    Volume: {
      ...Object.fromEntries(Object.values(xStocks).map(symbol => [
        symbol, `Settled swaps between ${symbol} and a non-xStock asset, in either direction.`,
      ])),
      [stockCross]: 'Settled swaps between two listed xStocks, counted once.',
      [otherSpot]: 'Settled swaps between two assets outside the listed xStock markets.',
    },
  },
};

export default adapter;
