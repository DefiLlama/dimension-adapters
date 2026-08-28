import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchBuilderCodeRevenue } from "../../helpers/hyperliquid";
import fetchURL from "../../utils/fetchURL";

const LIGHTER_API_BASE_URL = 'https://mainnet.zklighter.elliot.ai/api/v1/partnerStats';
const HL_BUILDER_ADDRESS = "0x2868fc0d9786a740b491577a43502259efa78a39";
const LIGHTER_ACCOUNT_INDEX = 721785;

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  if (options.chain === CHAIN.HYPERLIQUID) {
    const hyperliquidResponse =await fetchBuilderCodeRevenue({
        options,
        builder_address: HL_BUILDER_ADDRESS,
      });
    
    dailyVolume.add(hyperliquidResponse.dailyVolume);
    dailyFees.add(hyperliquidResponse.dailyFees, "Hyperliquid Builder Code Fees");
    dailyRevenue.add(hyperliquidResponse.dailyRevenue, "Hyperliquid Builder Code Fees");
    dailyProtocolRevenue.add(hyperliquidResponse.dailyProtocolRevenue, "Hyperliquid Builder Code Fees");
  }
  else if (options.chain === CHAIN.ZK_LIGHTER) {
    const lighterResponse = await fetchURL(`${LIGHTER_API_BASE_URL}?account_index=${LIGHTER_ACCOUNT_INDEX}&start_timestamp=${options.startTimestamp * 1000}&end_timestamp=${options.endTimestamp * 1000}`);

    dailyVolume.addUSDValue(Number(lighterResponse.total_volume));
    dailyFees.addUSDValue(Number(lighterResponse.total_fees_earned), 'Lighter Partner Fees');
    dailyRevenue.addUSDValue(Number(lighterResponse.total_fees_earned), 'Lighter Partner Fees');
    dailyProtocolRevenue.addUSDValue(Number(lighterResponse.total_fees_earned), 'Lighter Partner Fees');
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
  };
};

const methodology = {
  Fees: "builder code revenue from Hyperliquid Perps Trades and Lighter Partner Fees.",
  Revenue: "builder code revenue from Hyperliquid Perps Trades and Lighter Partner Fees.",
  ProtocolRevenue: "builder code revenue from Hyperliquid Perps Trades and Lighter Partner Fees.",
}

const breakdownMethodology = {
  Fees: {
    "Hyperliquid Builder Code Fees": "builder code revenue from Hyperliquid Perps Trades.",
    "Lighter Partner Fees": "Partner fees earned through lighter perps integration",
  },
  Revenue: {
    "Hyperliquid Builder Code Fees": "builder code revenue from Hyperliquid Perps Trades.",
    "Lighter Partner Fees": "Partner fees earned through lighter perps integration",
  },
  ProtocolRevenue: {
    "Hyperliquid Builder Code Fees": "builder code revenue from Hyperliquid Perps Trades.",
    "Lighter Partner Fees": "Partner fees earned through lighter perps integration",
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      start: "2024-10-27",
    },
    [CHAIN.ZK_LIGHTER]: {
      start: "2026-05-13",
    },
  },
  methodology,
  breakdownMethodology,
  doublecounted: true,
};

export default adapter;
