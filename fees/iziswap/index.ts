import fetchURL from "../../utils/fetchURL"
import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";


const historicalVolumeEndpoint = (chain_id: number, page: number) => `https://api.izumi.finance/api/v1/izi_swap/summary_record/?chain_id=${chain_id}&type=4&page_size=100000&page=${page}`

interface IVolumeall {
  feesDay: number;
  chainId: number;
  timestamp: number;
}
type TChains = {
  [k: Chain | string]: number;
};
type TAdapter = {
  [key:string]: any;
};

const chains: TChains =  {
  [CHAIN.IOTEX]: 4689,
  [CHAIN.HEMI]: 43111,
};

const fetch = (chain: Chain) => {
  return async (timestamp: number) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
    let isSuccess = true;
    let page = 1;
    const historical: IVolumeall[] = [];
    while (isSuccess) {
      const response = (await fetchURL(historicalVolumeEndpoint(chains[chain], page)));
      if (response.is_success){
        Array.prototype.push.apply(historical, response.data);
        page += 1;
      } else {
        isSuccess = false;
      };
    };
    const historicalVolume = historical.filter(e => e.chainId === chains[chain]);
    const totalFees = historicalVolume
      .filter(volItem => (new Date(volItem.timestamp).getTime()) <= dayTimestamp)
      .reduce((acc, { feesDay }) => acc + Number(feesDay), 0)

    const dailyFees = historicalVolume
      .find(dayItem => (new Date(dayItem.timestamp).getTime()) === dayTimestamp)?.feesDay

    return {
      totalFees,
      dailyFees,
      timestamp: dayTimestamp,
    };
  }
};

const adapters: TAdapter = {};
for (const chain in chains) {
  let startTime = 1722009600;
  if (chains.hasOwnProperty(chain)) {
    adapters[chain] = {
      fetch: fetch(chain),
      start: startTime,
      customBackfill: customBackfill(chain, fetch)
    };
  };
};

const adapter: SimpleAdapter = {
  adapter: adapters
};

export default adapter;
