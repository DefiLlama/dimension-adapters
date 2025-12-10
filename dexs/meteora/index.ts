import { CHAIN } from '../../helpers/chains';
import { httpGet } from '../../utils/fetchURL';
import { getSolanaReceived } from '../../helpers/token';
import { FetchOptions } from '../../adapters/types';
import CoreAddresses from '../../helpers/coreAssets.json';

const meteoraStatsEndpoint = 'https://amm-v2.meteora.ag/pools/v2';
const BUYBACK_WALLET = 'FzULv8pR9Rd7cyVKjVkzmJ1eqEmgwDnzjYyNUcEJtoG9';

interface Pool {
  total_count: number
  data: Array<{
    trading_volume: number
    fee_volume: number
  }>
}

async function fetch(options: FetchOptions) {
  let dailyVolume = 0;
  let dailyFees = 0;

  let page = 0;
  const url = `${meteoraStatsEndpoint}?page=${page}&size=100000`;
  const response: Pool = (await httpGet(url));

  response.data.forEach(pool => {
    dailyVolume += pool.trading_volume
    dailyFees += pool.fee_volume
  })
  if (isNaN(dailyVolume) || isNaN(dailyFees)) throw new Error('Invalid daily volume')

  const dailyHoldersRevenue = await getSolanaReceived({
    options,
    target: BUYBACK_WALLET,
    mints: [CoreAddresses.solana.MET],
  })

  return {
    dailyVolume,
    dailyFees,
    dailyHoldersRevenue,
  }
}

export default {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      runAtCurrTime: true,
      start: '2024-04-30', // Apr 30 2024 - 00:00:00 UTC
    }
  }
}
