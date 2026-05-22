import fetchURL from "../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Source: Reya-Labs/reya-deployments packages/tomls/src/omnibus/reya_network.toml.
const PASSIVE_PERP_PROXY = "0x27E5cb712334e101B3c232eB0Be198baaa595F5F";
const MARKET_DEFINITIONS_ENDPOINT = "https://api.reya.xyz/v2/marketDefinitions";
const WAD = 1e18;

const abis = {
  // Source: Reya docs + Reya-Labs/reya-deployments IPassivePerpProxy.
  getOpenBaseInterest: "function getOpenBaseInterest(uint128 marketId) view returns (uint256)",
  getLatestMTMData: "function getLatestMTMData(uint128 marketId) view returns (tuple(uint256 price, uint256 timestamp))",
};

const fetch = async (options: FetchOptions) => {
  const calls = (await fetchURL(MARKET_DEFINITIONS_ENDPOINT)).map(({ marketId }: any) => ({ params: [marketId] }));

  const [openInterests, prices] = await Promise.all([
    options.toApi.multiCall({
      target: PASSIVE_PERP_PROXY,
      abi: abis.getOpenBaseInterest,
      calls,
      permitFailure: true,
    }),
    options.toApi.multiCall({
      target: PASSIVE_PERP_PROXY,
      abi: abis.getLatestMTMData,
      calls,
      permitFailure: true,
    }),
  ]);

  const openInterestAtEnd = openInterests.reduce((sum: number, oi: any, i: number) => {
    const price = prices[i]?.price;
    if (oi == null || price == null) return sum;
    return sum + (Number(oi) / WAD) * (Number(price) / WAD);
  }, 0);

  return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    openInterestAtEnd: "Active market IDs are discovered from Reya's official market definitions API. Open interest is fetched onchain from getOpenBaseInterest and valued with getLatestMTMData mark prices.",
  },
  adapter: {
    [CHAIN.REYA]: {
      fetch,
      start: "2024-08-11",
    },
  },
};

export default adapter;
