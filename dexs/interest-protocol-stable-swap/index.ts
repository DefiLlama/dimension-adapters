import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { queryEvents } from '../../helpers/sui';

// https://github.com/interest-protocol/interest-stable-swap-sdk/blob/main/src/interest-stable-swap-sdk/constants.ts
const STABLE_SWAP_PACKAGE = '0x50052aca3d7b971bd9824e1bb151748d03870adfe3ba06dce384d2a77297c719';
const WAL = '0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL';
// pool state: fee = 0.1% of amount out, admin_fee = 20% of fee
const ADMIN_FEE_SHARE = 0.2;

// TypeName comes back either as a plain string or as `{ name }`
const normalize = (coin: any) => {
  const name: string = coin?.name ?? coin;
  return name.startsWith('0x') ? name : '0x' + name;
};

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const events = await queryEvents({
    eventModule: { package: STABLE_SWAP_PACKAGE, module: 'interest_stable_pool' },
    options,
  });

  for (const { pos0: swap } of events) {
    if (swap?.amountIn === undefined) continue; // not a Swap event

    // the only pool is WAL/WWAL and WWAL is unpriced, so value every swap by its WAL leg
    const amountIn = BigInt(swap.amountIn);
    const amountOut = BigInt(swap.amountOut);
    const fee = BigInt(swap.fee); // in coinOut units
    if (normalize(swap.coinIn) === WAL) {
      dailyVolume.add(WAL, amountIn);
      if (amountOut > 0n) dailyFees.add(WAL, (fee * amountIn) / amountOut);
    } else {
      dailyVolume.add(WAL, amountOut);
      dailyFees.add(WAL, fee);
    }
  }

  const dailyRevenue = dailyFees.clone(ADMIN_FEE_SHARE);
  const dailySupplySideRevenue = dailyFees.clone(1 - ADMIN_FEE_SHARE);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SUI],
  start: '2025-04-04',
  pullHourly: true,
  methodology: {
    Volume: 'Sum of swap amounts on the WAL/WWAL stable pool, valued by the WAL leg of each swap.',
    Fees: 'Swap fee of 0.1% charged on every swap.',
    UserFees: 'Swap fee of 0.1% paid by traders.',
    Revenue: 'Admin share (20%) of swap fees.',
    ProtocolRevenue: 'Admin share (20%) of swap fees.',
    SupplySideRevenue: 'Remaining 80% of swap fees kept by liquidity providers.',
  },
};

export default adapter;
