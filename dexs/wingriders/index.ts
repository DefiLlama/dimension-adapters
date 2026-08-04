import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

//   dailyVolume      - single-sided (input leg only) across V1 + V2 + stableswap pools
//   dailySwapFees    - LP swap fee only (swapFeeInBasis leg)
//   dailyBatcherFees - flat ~2 ADA per-order batcher tx-cost reimbursement, not a fee -> excluded
// The treasury/project/reserve fee legs aren't published here, so revenue is 0.
const url = "https://api.mainnet.wingriders.com/v1/defillama";

async function fetch(options: FetchOptions) {
  const data = await fetchURL(url);

  const adaAmount = (key: string): number => {
    const value = Number(data[key]);
    if (!Number.isFinite(value))
      throw new Error(`WingRiders ${url}: '${key}' missing or non-numeric -> ${JSON.stringify(data)}`);
    return value;
  };

  const dailyVolume = options.createBalances();
  dailyVolume.addCGToken('cardano', adaAmount('dailyVolume'));

  const dailyFees = options.createBalances();
  dailyFees.addCGToken('cardano', adaAmount('dailySwapFees'), 'Swap Fees');

  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addCGToken('cardano', adaAmount('dailySwapFees'), 'Swap Fees To LPs');

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyRevenue: 0,
  };
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.CARDANO],
  runAtCurrTime: true,
  methodology: {
    Volume: 'Total value swapped across all WingRiders V1, V2 and stableswap pools over the trailing 24 hours, counted once per trade and valued in ADA.',
    Fees: 'The swap fee traders pay to liquidity providers - about 0.30% on standard pools and 0.05% on stableswap pools. Excludes the ~2 ADA per-order agent fee, which only reimburses batcher operators for the Cardano network transaction cost.',
    UserFees: 'Same as Fees - the swap fee is paid by the trader.',
    SupplySideRevenue: 'All of the reported swap fee, which is paid back into the pools and earned by liquidity providers.',
    Revenue: 'Zero here. WingRiders separately keeps a small protocol fee (about 0.05% on standard pools) plus optional project and reserve fees that accrue to on-chain treasuries, but those amounts are not published by the public data feed this adapter reads, so protocol revenue is not currently captured.',
  },
  breakdownMethodology: {
    Fees: {
      'Swap Fees': 'Liquidity-provider swap fee charged on every trade, summed across all pools and valued in ADA.',
    },
    SupplySideRevenue: {
      'Swap Fees To LPs': 'The swap fee is paid back into the pool reserves, so liquidity providers earn all of it.',
    },
  },
};

export default adapter;
