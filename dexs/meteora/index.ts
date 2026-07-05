import { CHAIN } from '../../helpers/chains';
import { httpGet } from '../../utils/fetchURL';
import { FetchOptions } from '../../adapters/types';
import { sleep } from '../../utils/utils';
import { METRIC } from '../../helpers/metrics';

const meteoraStatsEndpoint = 'https://damm-api.meteora.ag/pools/search';

// stable pool protocol fee is 0 but it is 20% of the LP Fee, for all volatile pools.
const VOLATILE_PROTOCOL_FEE_RATIO = 0.2;

function protocolFeeRatio(poolType?: string) {
  return poolType === 'stable' ? 0 : VOLATILE_PROTOCOL_FEE_RATIO;
}

interface Pool {
  total_count: number
  data: Array<{
    trading_volume: number
    fee_volume: number
    pool_type?: string
  }>
}

async function fetch(options: FetchOptions) {
  let dailyVolume = 0;
  let grossFees = 0;
  let protocolFees = 0;
  let lpFees = 0;

  let page = 0;
  const limit = 300;
  while (true) {
    const response: Pool = (await httpGet(`${meteoraStatsEndpoint}?page=${page}&size=${limit}&hide_low_tvl=10000`));

    const pools = response.data;
    if (pools.length === 0) break;
    for (const pool of pools) {
      const poolProtocolFee = pool.fee_volume * protocolFeeRatio(pool.pool_type);
      dailyVolume += pool.trading_volume;
      grossFees += pool.fee_volume;
      protocolFees += poolProtocolFee;
      lpFees += pool.fee_volume - poolProtocolFee;
    }

    if ([dailyVolume, grossFees, protocolFees, lpFees].some(isNaN)) throw new Error('Invalid data from Meteora DAMM v1 API');

    await sleep(100)

    page += 1;
  }

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(grossFees, METRIC.SWAP_FEES);
  dailyRevenue.addUSDValue(protocolFees, METRIC.PROTOCOL_FEES);
  dailySupplySideRevenue.addUSDValue(lpFees, METRIC.LP_FEES);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Volume: 'Daily swap volume across Meteora DAMM v1 pools.',
  Fees: 'Gross swap fees paid by traders across all DAMM v1 pools.',
  UserFees: 'Same as Fees, the swap fee traders pay.',
  Revenue: 'Protocol share of the swap fee: 20% of gross fees on volatile pools, 0% on stable pools.',
  ProtocolRevenue: 'Same as Revenue, the protocol share accrues to the Meteora treasury.',
  SupplySideRevenue: 'LP share of the swap fee: 80% of gross fees on volatile pools, 100% on stable pools.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: 'Gross swap fees (fee_volume = trading_volume x total_fee_pct) across constant-product/volatile and stable DAMM v1 pools.',
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: 'Protocol share of swap fees: 20% on volatile pools, 0% on stable pools.',
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: 'LP share of swap fees: 80% on volatile pools, 100% on stable pools.',
  },
}

export default {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      runAtCurrTime: true,
      start: '2024-04-30', // Apr 30 2024 - 00:00:00 UTC
    }
  },
  methodology,
  breakdownMethodology,
}
