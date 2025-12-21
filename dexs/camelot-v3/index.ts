import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { getUniV3LogAdapter, uniV3Exports } from '../../helpers/uniswap';

// Camelot V3 uses Algebra (Uniswap V3-style concentrated liquidity)
// Fees are pool-specific and read on-chain from the Algebra pool configuration
// Fee distribution (V3):
// - ~80% to Liquidity Providers
// - ~20% to protocol-controlled revenue (xGRAIL + treasury)
// Source: https://docs.camelot.exchange/tokenomics/protocol-earnings
// Architecture: https://docs.camelot.exchange/protocol/amm-v3

const baseAdapter = uniV3Exports({
  [CHAIN.APECHAIN]: {
    factory: '0x10aA510d94E094Bd643677bd2964c3EE085Daffc',
    start: '2024-10-15',
    isAlgebraV3: true,
  },
  [CHAIN.GRAVITY]: {
    factory: '0x10aA510d94E094Bd643677bd2964c3EE085Daffc',
    start: '2024-07-04',
    isAlgebraV3: true,
  },
  [CHAIN.RARI]: {
    factory: '0xcF8d0723e69c6215523253a190eB9Bc3f68E0FFa',
    start: '2024-06-05',
    isAlgebraV3: true,
  },
  [CHAIN.REYA]: {
    factory: '0x10aA510d94E094Bd643677bd2964c3EE085Daffc',
    start: '2024-06-20',
    isAlgebraV3: true,
  },
  [CHAIN.SANKO]: {
    factory: '0xcF8d0723e69c6215523253a190eB9Bc3f68E0FFa',
    start: '2024-04-17',
    isAlgebraV3: true,
  },
});

// Arbitrum has two factories that need to be combined
const adapter: SimpleAdapter = {
  ...baseAdapter,
  adapter: {
    ...baseAdapter.adapter,
    [CHAIN.ARBITRUM]: {
      fetch: async (options: FetchOptions) => {
        const adapter1 = getUniV3LogAdapter({
          factory: '0x1a3c9B1d2F0529D97f2afC5136Cc23e58f1FD35B',
          isAlgebraV3: true,
          blacklistPools: [
            '0xf3527ef8de265eaa3716fb312c12847bfba66cef',
            '0x7788a3538c5fc7f9c7c8a74eac4c898fc8d87d92',
            '0x8467f85a834159c26227b21f9898ca0fa606eaa8'
          ],
        });
        const adapter2 = getUniV3LogAdapter({
          factory: '0xd490f2f6990c0291597fd1247651b4e0dcf684dd',
          isAlgebraV3: true,
        });

        const [res1, res2] = await Promise.all([adapter1(options), adapter2(options)]);

        // Combine results from both factories
        if (res2.dailyVolume) res1.dailyVolume.addBalances(res2.dailyVolume);
        if (res2.dailyFees) res1.dailyFees.addBalances(res2.dailyFees);

        return res1;
      },
      start: '2023-03-31',
    },
  },
};

export default adapter;
