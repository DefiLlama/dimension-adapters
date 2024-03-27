import fetchURL from "../../utils/fetchURL";
import { ChainBlocks, Fetch, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = "https://backend-lp.logx.trade/";
const endpoint = "statistics/header_stats?chainId=";

const chain_ids: { [chain: string]: string }  = {
    [CHAIN.MANTLE]: "5000",
    [CHAIN.MODE]: "34443",
    [CHAIN.BLAST]: "81457",
    [CHAIN.LINEA]: "59144",
    [CHAIN.KROMA]: "255",
    [CHAIN.MANTA]: "169",
    [CHAIN.TELOS]: "40",
    [CHAIN.FUSE]: "122",
}

interface IAPIResponse {
    totalVolume: string;
    totalUsers: string;
    _24HVolume: string;
    message: string;
}

const getFetch = async (timestamp: number, _: ChainBlocks, { createBalances, getLogs, chain, api }: FetchOptions): Promise<FetchResult> => {
    const { totalVolume, totalUsers, _24HVolume, message }: IAPIResponse = (
      await fetchURL(`${URL}${endpoint}${chain_ids[chain]}`)
    );
    const dailyVolume = _24HVolume;
    return {
      dailyVolume,
      totalVolume,
      timestamp,
    };
  };

const adapter: SimpleAdapter = {
    adapter: {
      [CHAIN.MANTLE]: {
        fetch: getFetch,
        start: 1701475200,
      },
      [CHAIN.MODE]: {
        fetch: getFetch,
        start: 1707436800,
      },
      [CHAIN.BLAST]: {
        fetch: getFetch,
        start: 1709337600,
      },
      [CHAIN.LINEA]: {
        fetch: getFetch,
        start: 1701475200,
      },
      [CHAIN.KROMA]: {
        fetch: getFetch,
        start: 1703548800,
      },
      [CHAIN.MANTA]: {
        fetch: getFetch,
        start: 1705968000,
      },
      [CHAIN.TELOS]: {
        fetch: getFetch,
        start: 1706522866,
      },
      [CHAIN.FUSE]: {
        fetch: getFetch,
        start: 1706659200,
      },
    },
  };

  export default adapter;
