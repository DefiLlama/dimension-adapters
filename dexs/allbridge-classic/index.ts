import { CHAIN } from "../../helpers/chains";
import { BaseAdapter, Chain, FetchResultVolume, IJSON, SimpleAdapter } from '../../adapters/types';
import fetchURL from '../../utils/fetchURL';

interface ChainData {
  id: string;
  volume?: number;
}

const getVolume = async (chainCode: string, fromDate: string, toDate: string): Promise<number> => {
  const url = `https://stats.a11bd.net/aggregated?dateFrom=${fromDate}&dateTo=${toDate}`;
  const responseBody = (await fetchURL(url));
  const chainData = responseBody.data.chains
    .filter((d: ChainData) => d.id === chainCode)
    .pop();
  return chainData?.volume ?? 0;
}

const getVolumeFunction = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultVolume> => {
    if (chain === CHAIN.HECO) { return {}} // skip HECO for now
    const chainCode = chainCodeMap[chain];
    const dateString = formatTimestampAsIsoDate(timestamp);
    const dailyVolume = await getVolume(chainCode, dateString, dateString);

    return {
      timestamp,
      dailyVolume: dailyVolume !== undefined ? String(dailyVolume) : undefined,
    } as FetchResultVolume;
  }
}

function formatTimestampAsIsoDate(timestamp: number) {
  return new Date(timestamp * 1000).toISOString().split("T")[0];
}

const chainCodeMap: {[key: Chain]: string} = {
  [CHAIN.ETHEREUM]: "ETH",
  [CHAIN.BSC]: "BSC",
  [CHAIN.TERRA]: "TRA",
  [CHAIN.AURORA]: "AURO",
  [CHAIN.POLYGON]: "POL",
  [CHAIN.HECO]: "HECO",
  [CHAIN.CELO]: "CELO",
  [CHAIN.AVAX]: "AVA",
  [CHAIN.FANTOM]: "FTM",
  [CHAIN.FUSE]: "FUSE",
  [CHAIN.SOLANA]: "SOL",
  [CHAIN.NEAR]: "NEAR",
  [CHAIN.HARMONY]: "HRM",
  [CHAIN.TEZOS]: "TEZ",
  [CHAIN.KLAYTN]: "KLAY",
  [CHAIN.WAVES]: "WAVE",
  [CHAIN.STELLAR]: "XLM",
  [CHAIN.STACKS]: "STKS",
}

const startTimes = {
  [CHAIN.ETHEREUM]: 1636761600,
  [CHAIN.BSC]: 1636761600,
  [CHAIN.TERRA]: 1639008000,
  [CHAIN.AURORA]: 1639440000,
  [CHAIN.POLYGON]: 1636502400,
  [CHAIN.HECO]: 1636761600,
  [CHAIN.CELO]: 1636761600,
  [CHAIN.AVAX]: 1636761600,
  [CHAIN.FANTOM]: 1637452800,
  [CHAIN.FUSE]: 1640995200,
  [CHAIN.SOLANA]: 1636502400,
  [CHAIN.NEAR]: 1643673600,
  [CHAIN.HARMONY]: 1640995200,
  [CHAIN.TEZOS]: 1654387200,
  [CHAIN.KLAYTN]: 1660521600,
  [CHAIN.WAVES]: 1663200000,
  [CHAIN.STELLAR]: 1672358400,
  [CHAIN.STACKS]: 1690416000,
} as IJSON<number>;


const adapter: SimpleAdapter = {
  adapter: Object.keys(chainCodeMap).reduce((acc, chain) => {
    acc[chain] = {
      fetch: getVolumeFunction(chain),
      start: startTimes[chain],
    };
    return acc;
  }, {} as BaseAdapter)
}

export default adapter;
