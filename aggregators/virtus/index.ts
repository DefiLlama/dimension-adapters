import { Adapter, FetchOptions } from '../../adapters/types';
import { httpGet } from '../../utils/fetchURL';
import { CHAIN } from '../../helpers/chains';
import { LifiDiamonds } from '../../helpers/aggregators/lifi';
import { getEnv } from '../../helpers/env';

const BACKEND_BASE = getEnv('VIRTUS_BACKEND_BASE');
const start = '2025-09-03';

const CHAINS: Record<string, { id: string }> = {
  [CHAIN.ETHEREUM]: {  id: 'ethereum' },
  [CHAIN.SOLANA]: {  id: 'solana' },
  [CHAIN.BSC]: {  id: 'bsc' },
  [CHAIN.SCROLL]: {  id: 'scroll' },
  [CHAIN.BASE]: {  id: 'base' },
  [CHAIN.BITCOIN]: {  id: 'bitcoin' },
  [CHAIN.ARBITRUM]: {  id: 'arbitrum' },
  [CHAIN.POLYGON]: {  id: 'polygon' },
  [CHAIN.OPTIMISM]: {  id: 'optimism' },
  [CHAIN.LINEA]: {  id: 'linea' },
  [CHAIN.CELO]: {  id: 'celo' },
  [CHAIN.AVAX]: {  id: 'avax' },
  [CHAIN.ERA]: {  id: 'era' },
  [CHAIN.MODE]: {  id: 'mode' },
  [CHAIN.TRON]: {  id: 'tron' },
  [CHAIN.ZORA]: {  id: 'zora' },
  [CHAIN.BLAST]: {  id: 'blast' },
  [CHAIN.OSMOSIS]: {  id: 'osmosis' },
  [CHAIN.COSMOS]: {  id: 'cosmos' },
  [CHAIN.FANTOM]: {  id: 'fantom' },
  [CHAIN.MOONRIVER]: {  id: 'moonriver' },
  [CHAIN.TAIKO]: {  id: 'taiko' },
  [CHAIN.STARKNET]: {  id: 'starknet' },
  [CHAIN.POLYGON_ZKEVM]: {  id: 'polygon_zkevm' },
  [CHAIN.SUI]: {  id: 'sui' },
  [CHAIN.CRONOS]: {  id: 'cronos' },
  [CHAIN.NOBLE]: {  id: 'noble' },
  [CHAIN.BOBA]: {  id: 'boba' },
  [CHAIN.THORCHAIN]: {  id: 'thorchain' },
  [CHAIN.FUSE]: {  id: 'fuse' },
  [CHAIN.XDAI]: {  id: 'xdai' },
  [CHAIN.HARMONY]: {  id: 'harmony' },
  [CHAIN.MOONBEAM]: {  id: 'moonbeam' },
  [CHAIN.TERRA]: {  id: 'terra' },
  [CHAIN.SONIC]: {  id: 'sonic' },
  [CHAIN.TON]: {  id: 'ton' },
  [CHAIN.BERACHAIN]: {  id: 'berachain' },
  [CHAIN.AURORA]: {  id: 'aurora' },
  [CHAIN.ROOTSTOCK]: {  id: 'rsk' },
  [CHAIN.KLAYTN]: {  id: 'klaytn' },
  [CHAIN.KAVA]: {  id: 'kava' },
  [CHAIN.EVMOS]: {  id: 'evmos' },
  [CHAIN.OKEXCHAIN]: {  id: 'okexchain' },
  [CHAIN.FILECOIN]: {  id: 'filecoin' },
  [CHAIN.CORE]: {  id: 'core' },
  [CHAIN.KROMA]: {  id: 'kroma' },
  [CHAIN.XLAYER]: {  id: 'xlayer' },
  [CHAIN.BITLAYER]: {  id: 'btr' },
  [CHAIN.MERLIN]: {  id: 'merlin' },
  [CHAIN.BOB]: {  id: 'bob' },
  [CHAIN.ZKLINK]: {  id: 'zklink' },
  [CHAIN.ZETA]: {  id: 'zeta' },
  [CHAIN.PULSECHAIN]: {  id: 'pulse' },
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
  if (!acc[chain]) acc[chain] = {  id: chain.toLowerCase() } as any;
  return acc;
}, { ...CHAINS } as Record<string, { start: string; id: string }>);

const adapter: Adapter = {
  version: 2,
  start,
  fetch,
  chains: Object.keys(CHAINS_UNION),
};

export default adapter;


