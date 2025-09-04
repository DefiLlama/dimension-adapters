import { Adapter, FetchOptions } from '../../adapters/types';
import { httpGet } from '../../utils/fetchURL';
import { CHAIN } from '../../helpers/chains';
import { LifiDiamonds } from '../../helpers/aggregators/lifi';
import { getEnv } from '../../helpers/env';

const BACKEND_BASE = getEnv('VIRTUS_BACKEND_BASE');
const UNIFORM_START = '2025-09-03';

const CHAINS: Record<string, { start: string; id: string }> = {
  [CHAIN.ETHEREUM]: { start: UNIFORM_START, id: 'ethereum' },
  [CHAIN.SOLANA]: { start: UNIFORM_START, id: 'solana' },
  [CHAIN.BSC]: { start: UNIFORM_START, id: 'bsc' },
  [CHAIN.SCROLL]: { start: UNIFORM_START, id: 'scroll' },
  [CHAIN.BASE]: { start: UNIFORM_START, id: 'base' },
  [CHAIN.BITCOIN]: { start: UNIFORM_START, id: 'bitcoin' },
  [CHAIN.ARBITRUM]: { start: UNIFORM_START, id: 'arbitrum' },
  [CHAIN.POLYGON]: { start: UNIFORM_START, id: 'polygon' },
  [CHAIN.OPTIMISM]: { start: UNIFORM_START, id: 'optimism' },
  [CHAIN.LINEA]: { start: UNIFORM_START, id: 'linea' },
  [CHAIN.CELO]: { start: UNIFORM_START, id: 'celo' },
  [CHAIN.AVAX]: { start: UNIFORM_START, id: 'avax' },
  [CHAIN.ERA]: { start: UNIFORM_START, id: 'era' },
  [CHAIN.MODE]: { start: UNIFORM_START, id: 'mode' },
  [CHAIN.TRON]: { start: UNIFORM_START, id: 'tron' },
  [CHAIN.ZORA]: { start: UNIFORM_START, id: 'zora' },
  [CHAIN.BLAST]: { start: UNIFORM_START, id: 'blast' },
  [CHAIN.OSMOSIS]: { start: UNIFORM_START, id: 'osmosis' },
  [CHAIN.COSMOS]: { start: UNIFORM_START, id: 'cosmos' },
  [CHAIN.FANTOM]: { start: UNIFORM_START, id: 'fantom' },
  [CHAIN.MOONRIVER]: { start: UNIFORM_START, id: 'moonriver' },
  [CHAIN.TAIKO]: { start: UNIFORM_START, id: 'taiko' },
  [CHAIN.STARKNET]: { start: UNIFORM_START, id: 'starknet' },
  [CHAIN.POLYGON_ZKEVM]: { start: UNIFORM_START, id: 'polygon_zkevm' },
  [CHAIN.SUI]: { start: UNIFORM_START, id: 'sui' },
  [CHAIN.CRONOS]: { start: UNIFORM_START, id: 'cronos' },
  [CHAIN.NOBLE]: { start: UNIFORM_START, id: 'noble' },
  [CHAIN.BOBA]: { start: UNIFORM_START, id: 'boba' },
  [CHAIN.THORCHAIN]: { start: UNIFORM_START, id: 'thorchain' },
  [CHAIN.FUSE]: { start: UNIFORM_START, id: 'fuse' },
  [CHAIN.XDAI]: { start: UNIFORM_START, id: 'xdai' },
  [CHAIN.HARMONY]: { start: UNIFORM_START, id: 'harmony' },
  [CHAIN.MOONBEAM]: { start: UNIFORM_START, id: 'moonbeam' },
  [CHAIN.TERRA]: { start: UNIFORM_START, id: 'terra' },
  [CHAIN.SONIC]: { start: UNIFORM_START, id: 'sonic' },
  [CHAIN.TON]: { start: UNIFORM_START, id: 'ton' },
  [CHAIN.BERACHAIN]: { start: UNIFORM_START, id: 'berachain' },
  [CHAIN.AURORA]: { start: UNIFORM_START, id: 'aurora' },
  [CHAIN.ROOTSTOCK]: { start: UNIFORM_START, id: 'rsk' },
  [CHAIN.KLAYTN]: { start: UNIFORM_START, id: 'klaytn' },
  [CHAIN.KAVA]: { start: UNIFORM_START, id: 'kava' },
  [CHAIN.EVMOS]: { start: UNIFORM_START, id: 'evmos' },
  [CHAIN.OKEXCHAIN]: { start: UNIFORM_START, id: 'okexchain' },
  [CHAIN.FILECOIN]: { start: UNIFORM_START, id: 'filecoin' },
  [CHAIN.CORE]: { start: UNIFORM_START, id: 'core' },
  [CHAIN.KROMA]: { start: UNIFORM_START, id: 'kroma' },
  [CHAIN.XLAYER]: { start: UNIFORM_START, id: 'xlayer' },
  [CHAIN.BITLAYER]: { start: UNIFORM_START, id: 'btr' },
  [CHAIN.MERLIN]: { start: UNIFORM_START, id: 'merlin' },
  [CHAIN.BOB]: { start: UNIFORM_START, id: 'bob' },
  [CHAIN.ZKLINK]: { start: UNIFORM_START, id: 'zklink' },
  [CHAIN.ZETA]: { start: UNIFORM_START, id: 'zeta' },
  [CHAIN.PULSECHAIN]: { start: UNIFORM_START, id: 'pulse' },
};

const fetch = async (options: FetchOptions) => {
  const { chain, endTimestamp } = options;
  const info = CHAINS[chain];
  if (!info) return { dailyVolume: 0, timestamp: endTimestamp };
  const url = `${BACKEND_BASE}/defillama/volume?chain=${info.id}&timestamp=${endTimestamp}`;
  const res = await httpGet(url) as { dailyVolume: number };
  return { dailyVolume: res?.dailyVolume || 0, timestamp: endTimestamp };
};

const CHAINS_UNION: Record<string, { start: string; id: string }> = Object.entries(LifiDiamonds).reduce((acc, [chain]: any) => {
  if (!acc[chain]) acc[chain] = { start: UNIFORM_START, id: chain.toLowerCase() } as any;
  return acc;
}, { ...CHAINS } as Record<string, { start: string; id: string }>);

const adapter: Adapter = {
  version: 2,
  adapter: Object.fromEntries(Object.keys(CHAINS_UNION).map((chain) => [chain, { fetch, start: UNIFORM_START }]))
};

export default adapter;


