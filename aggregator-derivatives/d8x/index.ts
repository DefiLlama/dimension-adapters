import { Chain } from "@defillama/sdk/build/types";
import { FetchOptions, FetchResultVolume } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

type TChainIDs = {
  [key in Chain]?: number;
};

const chainIDs: TChainIDs = {
  [CHAIN.BASE]: 8453,
  [CHAIN.ARBITRUM]: 42161,
  //   [CHAIN.POLYGON_ZKEVM]: 1101, // tbd
  [CHAIN.BERACHAIN]: 80094,
};

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultVolume> => {
    const chainID = chainIDs[chain];
    const data: any = await fetchURL(
      `https://drip.d8x.xyz/coingecko/contracts?chain_id=${chainID}`
    );
    const dailyVolume = data.contracts?.reduce(
      (v, { target_volume }) => v + Number(target_volume),
      0
    );
    return {
      dailyVolume: dailyVolume || 0,
      timestamp,
    };
  };
};

export default {
  version: 2,
  adapter: {
    [CHAIN.BERACHAIN]: {
      fetch: fetch(CHAIN.BERACHAIN),
      start: "2025-02-10",
      runAtCurrTime: true,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: "2023-03-26",
      runAtCurrTime: true,
    },
    [CHAIN.BASE]: {
      fetch: fetch(CHAIN.BASE),
      start: "2024-12-03",
      runAtCurrTime: true,
    },
    // [CHAIN.POLYGON_ZKEVM]: {
    //   fetch: fetch(CHAIN.POLYGON_ZKEVM),
    //   start: "2023-10-12",
    //   runAtCurrTime: true,
    // },
  },
};
