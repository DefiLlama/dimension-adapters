import axios from "axios";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const decimalScalars = {
  SUI: 1_000_000_000,
  DEEP: 1_000_000,
  WUSDC: 1_000_000,
  BETH: 100_000_000,
  WUSDT: 1_000_000,
};

const pools = {
  SUI_USDC:
    "0xe05dafb5133bcffb8d59f4e12465dc0e9faeaa05e3e342a08fe135800e3e4407",
  DEEP_SUI:
    "0xb663828d6217467c8a1838a03793da896cbe745b150ebd57d82f814ca579fc22",
  DEEP_USDC:
    "0xf948981b806057580f91622417534f491da5f61aeaf33d0ed8e69fd5691c95ce",
  WUSDC_USDC:
    "0xa0b9ebefb38c963fd115f52d71fa64501b79d1adcb5270563f92ce0442376545",
  WUSDT_USDC:
    "0x4e2ca3988246e1d50b9bf209abb9c1cbfec65bd95afdacc620a36c67bdb8452f",
};

const turbosPriceAddress = {
  SUI: "https://api.dexscreener.com/latest/dex/pairs/sui/0x5eb2dfcdd1b15d2021328258f6d5ec081e9a0cdcfa9e13a0eaeb9b5f7505ca78",
  DEEP: "https://api.dexscreener.com/latest/dex/pairs/sui/0x17544259f33f56b2d035cf516e18bf0ad09e0c6d174892980da648f623aa8832",
};

const fetchVolumeInUsd = async (
  volumeData: Record<string, number>
): Promise<number> => {
  let totalVolumeInUsd = 0;

  for (const [poolAddress, poolVolume] of Object.entries(volumeData)) {
    const poolKey = Object.keys(pools).find(
      (key) => pools[key] === poolAddress
    );
    const baseToken = poolKey!.split("_")[0];
    const decimalScalar = decimalScalars[baseToken];
    const volume = Number(poolVolume) / decimalScalar;

    const priceUrl = turbosPriceAddress[baseToken] || null;
    let tokenPriceUsd = 1;

    if (priceUrl) {
      const priceResponse = await axios.get(priceUrl);
      tokenPriceUsd = priceResponse.data.pairs[0].priceUsd;
    }

    totalVolumeInUsd += volume * tokenPriceUsd;
  }

  return totalVolumeInUsd;
};

const fetch: any = async (options: FetchOptions) => {
  try {
    const poolId = Object.values(pools).join(",");

    const dailyVolumeUrl = `http://localhost:9008/get_24hr_volume/${poolId}`; // Update to prod url
    const dailyVolumeResponse = await axios.get(dailyVolumeUrl);
    const dailyVolumeData = dailyVolumeResponse.data;

    if (!dailyVolumeData)
      throw new Error(`No daily volume data found for pool: ${poolId}`);

    const dailyVolumeInUsd = await fetchVolumeInUsd(dailyVolumeData);

    const startTime = new Date("2024-10-01T00:00:00Z").getTime();
    const endTime = Date.now();
    const historicalVolumeUrl = `http://localhost:9008/get_historical_volume/${poolId}/${startTime}/${endTime}`; // Update to prod url
    const historicalVolumeResponse = await axios.get(historicalVolumeUrl);
    const historicalVolumeData = historicalVolumeResponse.data;

    if (!historicalVolumeData)
      throw new Error(`No historical volume data found for pool: ${poolId}`);

    const totalVolumeInUsd = await fetchVolumeInUsd(historicalVolumeData);

    return {
      dailyVolume: dailyVolumeInUsd,
      totalVolume: totalVolumeInUsd,
    };
  } catch (error) {
    console.error("Error fetching volume or token price:", error);
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
