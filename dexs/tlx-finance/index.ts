import BigNumber from "bignumber.js";
import {
  FetchGetLogsOptions,
  FetchOptions,
  FetchResultV2,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ChainApi } from "@defillama/sdk";

const FACTORY = "0x5Dd85f51e9fD6aDE8ecc216C07919ecD443eB14d";

const MINT_EVENT =
  "event Minted(address indexed account, uint256 leveragedTokenAmount, uint256 baseAssetAmount)";
const REDEEM_EVENT =
  "event Redeemed(address indexed account, uint256 leveragedTokenAmount, uint256 baseAssetAmount)";

const fetchSUsdPrice = async (): Promise<number> => {
  const ID = "optimism:0x8c6f28f2F1A3C87F0f938b96d27520d9751ec8d9";
  const ENDPOINT = `https://coins.llama.fi/prices/current/${ID}`;
  const response = await fetch(ENDPOINT);
  const data = await response.json();
  if (!data) throw new Error("no data");
  if (!data.coins) throw new Error("no data.coins");
  const priceData = data.coins[ID];
  if (!priceData) throw new Error("no priceData");
  const price = priceData.price;
  if (!price) throw new Error("no price");
  if (price === 0) throw new Error("price is 0");
  return price;
};

const fetchLeveragedTokenVolume = async (
  getLogs: (params: FetchGetLogsOptions) => Promise<any[]>,
  toApi: ChainApi,
  token: string
): Promise<number> => {
  const targetLeverage = await toApi.call({
    target: token,
    abi: "function targetLeverage() view returns (uint256)",
    params: [],
  });
  const mints: any[] = await getLogs({
    targets: [token],
    eventAbi: MINT_EVENT,
  });
  const sUsdMintVolume = mints
    .reduce(
      (acc: any, log: any) => acc.plus(log.baseAssetAmount),
      new BigNumber(0)
    )
    .times(targetLeverage)
    .div(1e18)
    .div(1e18)
    .toNumber();
  const redeems: any[] = await getLogs({
    targets: [token],
    eventAbi: REDEEM_EVENT,
  });
  const sUsdRedeemVolume = redeems
    .reduce(
      (acc: any, log: any) => acc.plus(log.baseAssetAmount),
      new BigNumber(0)
    )
    .times(targetLeverage)
    .div(1e18)
    .div(1e18)
    .toNumber();
  return sUsdMintVolume + sUsdRedeemVolume;
};

const fetchVolume = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { getLogs, toApi } = options;
  let sUsddailyVolume = 0;
  const allTokens = await toApi.call({
    target: FACTORY,
    abi: "function allTokens() view returns (address[] memory)",
    params: [],
  });
  for (const token of allTokens) {
    const volume = await fetchLeveragedTokenVolume(getLogs, toApi, token);
    sUsddailyVolume += volume;
  }

  const sUsdPrice = await fetchSUsdPrice();
  const dailyVolume = sUsddailyVolume * sUsdPrice;

  return { dailyVolume };
};
const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: fetchVolume,
      start: 1715656337,
    },
  },
};

export default adapter;
