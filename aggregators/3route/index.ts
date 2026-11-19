import { gql, request } from "graphql-request";

import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL"
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";

interface DappStat {
  volume_usd: number;
}

interface TezosVolumeResponse {
  dapp_stat_1d: DappStat[];
}

interface EvmVolumeResponse {
  day: string;
  total_volume: number;
}

const dappSlug = '3route'
const tezosURL = 'https://3route-tezos.dipdup.net/v1/graphql';
const evmURL = 'https://3route-etherlink.dipdup.net/v1/volume/day'

// start is the day of the first block indexed for router 0x333333333c306C76f341028122ae7c90A334D176 (Etherlink also includes the previous router)
const evmChains: Record<string, { chainId: number, start: string }> = {
  [CHAIN.ETHERLINK]: { chainId: 42793, start: '2025-09-01' },
  [CHAIN.ROBINHOOD]: { chainId: 4663, start: '2026-09-10' },
  [CHAIN.MONAD]: { chainId: 143, start: '2026-09-10' },
  [CHAIN.BASE]: { chainId: 8453, start: '2026-09-19' },
  [CHAIN.SONIC]: { chainId: 146, start: '2026-10-07' },
  [CHAIN.ETHEREUM]: { chainId: 1, start: '2026-10-12' },
}

const query = gql`
  query GetDailyVolume($dappSlug: String!, $startDate: timestamptz!, $endDate: timestamptz!) {
    dapp_stat_1d(
      where: {
        dapp_slug: {_eq: $dappSlug}
        bucket: {
          _gte: $startDate
          _lt: $endDate
        }
      }
    ) {
      volume_usd
    }
  }
`;


const fetchTezos = async ({ startOfDay }: FetchOptions): Promise<FetchResult> => {
  const startDate = new Date(startOfDay * 1000).toISOString()
  const endDate = new Date((startOfDay + 86400) * 1000).toISOString()

  const response = await request<TezosVolumeResponse>(tezosURL, query, { dappSlug, startDate, endDate })
  if (response.dapp_stat_1d.length == 0) {
    return { dailyVolume: 0 }
  }

  return {
    dailyVolume: response.dapp_stat_1d[0].volume_usd
  }
}

const fetchEvm = async ({ startOfDay, chain }: FetchOptions): Promise<FetchResult> => {
  const day = new Date(startOfDay * 1000).toISOString().split('T')[0]

  // end is inclusive, the response has only days with swaps
  const response: EvmVolumeResponse[] = await fetchURL(`${evmURL}?start=${day}&end=${day}&chain=${evmChains[chain].chainId}`);
  const volume = response.find((item) => item.day.startsWith(day))

  return {
    dailyVolume: volume ? volume.total_volume : 0
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.TEZOS]: {
      fetch: fetchTezos,
      start: '2022-11-15',
    },
    ...Object.fromEntries(Object.entries(evmChains).map(([chain, { start }]) => [chain, { fetch: fetchEvm, start }])),
  },
  methodology: {
    Volume: 'Volume of swaps routed through 3route, valued by the input token price at the swap time.',
  },
};

export default adapter;
