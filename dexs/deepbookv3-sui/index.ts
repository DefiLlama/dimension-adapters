import axios from "axios";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetch: any = async (options: FetchOptions) => {
  try {
    const SUI_DECIMAL_SCALAR = 1_000_000_000; // 9 decimals
    const poolId =
      "0xe05dafb5133bcffb8d59f4e12465dc0e9faeaa05e3e342a08fe135800e3e4407";
    const url = `https://deepbook-indexer.mainnet.mystenlabs.com/get_24hr_volume/${poolId}`;

    const response = await axios.get(url);
    const volumeData = response.data; // Update this to include multiple pools when API ready
    if (!volumeData) throw new Error(`No volume data found for pool ${poolId}`);

    const priceResponse = await axios.get(
      "https://api.dexscreener.com/latest/dex/pairs/sui/0x5eb2dfcdd1b15d2021328258f6d5ec081e9a0cdcfa9e13a0eaeb9b5f7505ca78"
    );
    const suiPriceUsd = priceResponse.data.pairs[0].priceUsd;
    const volumeInUsd = (Number(volumeData) * suiPriceUsd) / SUI_DECIMAL_SCALAR;

    return {
      dailyVolume: volumeInUsd,
    };
  } catch (error) {
    console.error("Error fetching 24hr volume or SUI price:", error);
    throw error;
  }
};

export default {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetch,
      start: 0,
      runAtCurrTime: true,
    },
  },
} as SimpleAdapter;
