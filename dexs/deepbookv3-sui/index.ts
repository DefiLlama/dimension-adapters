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
}

const pools = {
  SUI_USDC: "0xe05dafb5133bcffb8d59f4e12465dc0e9faeaa05e3e342a08fe135800e3e4407",
  DEEP_SUI: "0xb663828d6217467c8a1838a03793da896cbe745b150ebd57d82f814ca579fc22",
  DEEP_USDC: "0xf948981b806057580f91622417534f491da5f61aeaf33d0ed8e69fd5691c95ce",
  WUSDC_USDC: "0xa0b9ebefb38c963fd115f52d71fa64501b79d1adcb5270563f92ce0442376545",
  WUSDT_USDC: "0x4e2ca3988246e1d50b9bf209abb9c1cbfec65bd95afdacc620a36c67bdb8452f",
};

const turbosPriceAddress = {
  SUI: "https://api.dexscreener.com/latest/dex/pairs/sui/0x5eb2dfcdd1b15d2021328258f6d5ec081e9a0cdcfa9e13a0eaeb9b5f7505ca78",
  DEEP: "https://api.dexscreener.com/latest/dex/pairs/sui/0x17544259f33f56b2d035cf516e18bf0ad09e0c6d174892980da648f623aa8832",
};

const fetchVolumeInUsd = (
  volumeData: Record<string, number>,
  balances: Balances,
) => {
  for (const [poolAddress, poolVolume] of Object.entries(volumeData)) {
    const poolKey = Object.keys(pools).find(
      (key) => pools[key] === poolAddress
    );
    const baseToken = coins[poolKey!.split("_")[0]]
    balances.add(baseToken, poolVolume)
  }
};

const fetch: any = async (options: FetchOptions) => {
    const poolId = Object.values(pools).join(",");

    // const dailyVolumeUrl = `https://deepbook-indexer.mainnet.mystenlabs.com/get_24hr_volume/${poolId}`;

    const startTime = options.startTimestamp * 1000;
    const endTime = options.endTimestamp * 1000
    const historicalVolumeUrl = `https://deepbook-indexer.mainnet.mystenlabs.com/get_historical_volume/${poolId}/${startTime}/${endTime}`;
    const historicalVolumeResponse = await axios.get(historicalVolumeUrl);
    const historicalVolumeData = historicalVolumeResponse.data;
    const dailyVolume = options.createBalances()

    if (!historicalVolumeData)
      throw new Error(`No volume data found for pool: ${poolId}`);

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
      start: 1727758800,
      meta: {
        methodology,
      },
    },
  },
} as SimpleAdapter;
