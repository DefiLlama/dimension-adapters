import ADDRESSES from '../../helpers/coreAssets.json'
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
const MINT_EVENT = "event Minted(address indexed account, uint256 leveragedTokenAmount, uint256 baseAssetAmount)";
const REDEEM_EVENT = "event Redeemed(address indexed account, uint256 leveragedTokenAmount, uint256 baseAssetAmount)";

const fetchLeveragedTokenVolume = async (
  getLogs: (params: FetchGetLogsOptions) => Promise<any[]>,
  toApi: ChainApi,
  tokens: string[]
): Promise<number> => {
  const targetLeverages = await toApi.multiCall({
    abi: "function targetLeverage() view returns (uint256)",
    calls: tokens.map((token) => ({
      target: token,
      params: [],
    })),
  });

  const mints_logs: any[] = await getLogs({
    targets: tokens,
    eventAbi: MINT_EVENT,
    flatten: false
  });
  // const redeems_logs: any[] = await getLogs({
  //   targets: tokens,
  //   eventAbi: REDEEM_EVENT,
  //   flatten: false
  // });

  const mint_valume = mints_logs.map((logs, i) => {
    return logs.map((log: any) => {
      return new BigNumber(log.leveragedTokenAmount).times(targetLeverages[i]).div(1e18)
    })
  }).flat().reduce((acc: any, log: any) => acc.plus(log), new BigNumber(0));

  // const redeem_valume = redeems_logs.map((logs, i) => {
  //   return logs.map((log: any) => {
  //     return new BigNumber(log.leveragedTokenAmount).times(targetLeverages[i]).div(1e18)
  //   })
  // }).flat().reduce((acc: any, log: any) => acc.plus(log), new BigNumber(0));

  return mint_valume.toNumber();
};

const fetchVolume = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { getLogs, api } = options;
  const allTokens = await api.call({
    target: FACTORY,
    abi: "function allTokens() view returns (address[] memory)",
    params: [],
  });
  const volume = await fetchLeveragedTokenVolume(getLogs, api, allTokens)
  const dailyVolume = options.createBalances()
  dailyVolume.add(ADDRESSES.optimism.sUSD, volume);
  return { dailyVolume };
};
const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: fetchVolume,
      start: '2024-05-14',
    },
  },
};

export default adapter;
