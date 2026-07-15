import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

//Recepients : 0xC34E5159AA94dDf235790836Dc4bD4b2789B1fB9 and 84L37ZcjLih9HNP4Np8yrTTQkdUx5aw3CYcx4ajboamT
const fetch = async (options: FetchOptions) => {
  const url = `https://app.gensuki.xyz/api/defillama/bridge?chain=${options.chain}`;
  const res = await fetchURL(url);
  const dayData = res.history?.find((h: any) => h.date === options.dateString);

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(dayData ? dayData.revenueUsd : 0, "Bridge Fees");

  return {
    dailyBridgeVolume: dayData ? dayData.volumeUsd : 0,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  BridgeVolume: "Trading volume from aggregated bridges across all chains.",
  Fees: "Users pay a bridge fee of 1.0% on bridge transactions.",
  Revenue: "All the bridge fees (1% on each bridge transaction) is retained by the protocol.",
  ProtocolRevenue: "All the bridge fees (1% on each bridge transaction) is retained by the protocol.",
}

const breakdownMethodology = {
  Fees: {
    "Bridge Fees": "Users pay a bridge fee of 1.0% on bridge transactions.",
  },
  Revenue: {
    "Bridge Fees": "All the bridge fees (1% on each bridge transaction) is retained by the protocol.",
  },
  ProtocolRevenue: {
    "Bridge Fees": "All the bridge fees (1% on each bridge transaction) is retained by the protocol.",
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: {
    [CHAIN.SOLANA]: {
      start: '2026-07-12',
    },
    [CHAIN.POLYGON]: {
      start: '2026-07-12',
    },
    [CHAIN.BASE]: {
      start: '2026-07-12',
    },
    [CHAIN.SEI]: {
      start: '2026-07-12',
    },
    [CHAIN.APECHAIN]: {
      start: '2026-07-12',
    },
    [CHAIN.ARBITRUM]: {
      start: '2026-07-12',
    },
    [CHAIN.ABSTRACT]: {
      start: '2026-07-12',
    },
    [CHAIN.BSC]: {
      start: '2026-07-12',
    },
    [CHAIN.ETHEREUM]: {
      start: '2026-07-12',
    },
    [CHAIN.ROBINHOOD]: {
      start: '2026-07-12',
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
