import ADDRESSES from '../../helpers/coreAssets.json'
import axios from "axios";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Balances } from "@defillama/sdk";

const coins = {
  DEEP: ADDRESSES.sui.DEEP,
  SUI: "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI",
  USDC: ADDRESSES.sui.USDC_CIRCLE,
  ETH: ADDRESSES.sui.ETH,
  WUSDT:
    ADDRESSES.sui.USDT,
  WUSDC:
    ADDRESSES.sui.USDC,
  NS: "0x5145494a5f5100e645e4b0aa950fa6b68f614e8c59e17bc5ded3495123a79178::ns::NS",
  TYPUS:
    "0xf82dc05634970553615eef6112a1ac4fb7bf10272bf6cbe0f80ef44a6c489385::typus::TYPUS",
  AUSD: "0x2053d08c1e2bd02791056171aab0fd12bd7cd7efad2ab8f6b9c8902f14df2ff2::ausd::AUSD",
  WAL: "0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL",
  DRF: "0x294de7579d55c110a00a7c4946e09a1b5cbeca2592fbb83fd7bfacba3cfeaf0e::drf::DRF",
  SEND: "0xb45fcfcc2cc07ce0702cc2d229621e046c906ef14d9b25e8e4d25f6e8763fef7::send::SEND",
  XBTC: "0x876a4b7bce8aeaef60464c11f4026903e9afacab79b9b142686158aa86560b50::xbtc::XBTC",
};

const fetchVolumeInUsd = (
  volumeData: Record<string, number>,
  balances: Balances
) => {
  for (const [poolName, poolVolume] of Object.entries(volumeData)) {
    const quoteTokenSymbol = poolName.split("_")[1];
    const quoteToken = coins[quoteTokenSymbol];

    if (!quoteToken) {
      console.warn(`Quote token for poolName ${poolName} not found`);
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

  if (!historicalVolumeData) throw new Error(`No volume data found for pools`);

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
  methodology,
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetch,
      start: "2024-10-01",
    },
  },
} as SimpleAdapter;
