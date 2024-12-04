import axios from "axios";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Balances } from "@defillama/sdk";

const coins = {
  DEEP: "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP",
  SUI: "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI",
  USDC: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
  ETH: "0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH",
  WUSDT: "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN",
  WUSDC: "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN",
  NS: "0x5145494a5f5100e645e4b0aa950fa6b68f614e8c59e17bc5ded3495123a79178::ns::NS",
  TYPUS: "0xf82dc05634970553615eef6112a1ac4fb7bf10272bf6cbe0f80ef44a6c489385::typus::TYPUS",
  AUSD: "0x2053d08c1e2bd02791056171aab0fd12bd7cd7efad2ab8f6b9c8902f14df2ff2::ausd::AUSD"
}

const fetchVolumeInUsd = (
  volumeData: Record<string, number>,
  balances: Balances,
) => {
  for (const [poolName, poolVolume] of Object.entries(volumeData)) {
    const quoteTokenSymbol = poolName.split("_")[1];
    const quoteToken = coins[quoteTokenSymbol];

    if (!quoteToken) {
      console.warn(`Base token for poolName ${poolName} not found`);
      continue;
    }

    balances.add(quoteToken, poolVolume);
  }
};

const fetch: any = async (options: FetchOptions) => {
  const startTime = options.startTimestamp; // times are in unix seconds
  const endTime = options.endTimestamp; // times are in unix seconds
  const historicalVolumeUrl = `https://deepbook-indexer.mainnet.mystenlabs.com/all_historical_volume?start_time=${startTime}&end_time=${endTime}&volume_in_base=false`;
  const historicalVolumeResponse = await axios.get(historicalVolumeUrl);
  const historicalVolumeData = historicalVolumeResponse.data;
  const dailyVolume = options.createBalances();

  if (!historicalVolumeData)
    throw new Error(`No volume data found for pools`);

  fetchVolumeInUsd(historicalVolumeData, dailyVolume);

  return {
    dailyVolume,
  };
};

const methodology = {
  dailyVolume: "Sum of volume in USD for all pools in the past 24 hours",
};

export default {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetch,
      start: '2024-10-01',
      meta: {
        methodology,
      },
    },
  },
} as SimpleAdapter;
