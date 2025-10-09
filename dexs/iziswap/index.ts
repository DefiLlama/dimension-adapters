import fetchURL from "../../utils/fetchURL"
import { Chain, FetchOptions } from "../../adapters/types";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const chainConfig: Record<Chain, { id: number, start: string }> = {
  [CHAIN.BSC]: { id: 56, start: '2023-04-05' },
  [CHAIN.ERA]: { id: 324, start: '2023-04-05' },
  [CHAIN.ARBITRUM]: { id: 42161, start: '2023-07-17' },
  [CHAIN.METER]: { id: 82, start: '2023-07-17' },
  [CHAIN.AURORA]: { id: 1313161554, start: '2022-10-11' },
  [CHAIN.POLYGON]: { id: 137, start: '2023-07-17' },
  [CHAIN.MANTLE]: { id: 5000, start: '2023-07-17' },
  [CHAIN.ONTOLOGY_EVM]: { id: 58, start: '2023-07-17' },
  [CHAIN.ULTRON]: { id: 1231, start: '2023-07-17' },
  [CHAIN.LINEA]: { id: 59144, start: '2023-07-17' },
  [CHAIN.SCROLL]: { id: 534352, start: '2023-07-17' },
  [CHAIN.BASE]: { id: 8453, start: '2023-07-17' },
  [CHAIN.MANTA]: { id: 169, start: '2023-07-17' },
  [CHAIN.ZETA]: { id: 7000, start: '2023-07-17' },
  [CHAIN.MODE]: { id: 34443, start: '2023-07-17' },
  [CHAIN.IOTEX]: { id: 4689, start: '2023-07-17' },
  // [CHAIN.HEMI]: { id: 43111, start: '2023-07-17' },
};

interface IVolumeall {
  volDay: number;
  feesDay: number;
  chainId: number;
  timestamp: number;
}

const historicalVolumeEndpoint = (chain_id: number, page: number) => `https://api.izumi.finance/api/v1/izi_swap/summary_record/?chain_id=${chain_id}&type=4&page_size=100000&page=${page}`


const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const startTimestamp = options.startOfDay - 86400;
  const endTimestamp = options.startOfDay;
  let isSuccess = true;
  let page = 1;
  const historical: IVolumeall[] = [];
  while (isSuccess) {
    const response = (await fetchURL(historicalVolumeEndpoint(chainConfig[options.chain].id, page)));
    if (response.is_success) {
      Array.prototype.push.apply(historical, response.data);
      page += 1;
    } else {
      isSuccess = false;
    };
  };

  const chainId = chainConfig[options.chain].id;
  const dailyVolume = historical
    .filter(({ chainId: id, timestamp }) =>
      id === chainId && timestamp > startTimestamp && timestamp < endTimestamp
    )
    .reduce((sum, { volDay }) => sum + Number(volDay), 0);

  const dailyFees = historical
    .filter(({ chainId: id, timestamp }) =>
      id === chainId && timestamp > startTimestamp && timestamp < endTimestamp
    )
    .reduce((sum, { feesDay }) => sum + Number(feesDay), 0);

  return {
    dailyVolume,
    dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig
};

export default adapter;
