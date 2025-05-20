import { FetchOptions, FetchResultVolume } from "../../adapters/types";
import * as sdk from "@defillama/sdk";

const factory = "0xC3179AC01b7D68aeD4f27a19510ffe2bfb78Ab3e";
const event_market_create =
  "event MarketCreated (uint256 indexed marketId, address premium, address collateral, address underlyingAsset, address token, string name, uint256 strike, address controller)";
const event_deposit = "event Deposit (address indexed user, address indexed receiver, uint256 id, uint256 assets)";


const fetch: any = async (timestamp: number, _: any, { getLogs, createBalances, }: FetchOptions): Promise<FetchResultVolume> => {
  const dailyVolume = createBalances()
  const logs_market_create = await getLogs({
    target: factory,
    fromBlock: 96059531,
    eventAbi: event_market_create,
    cacheInCloud: true,
  })
  const premiums = logs_market_create.map((e) => e.premium);
  const collaterals = logs_market_create.map((e) => e.collateral);
  let tokens = logs_market_create.map((e) => e.underlyingAsset);
  tokens = tokens.concat(tokens)
  const markets = premiums.concat(collaterals);
  const logs = await getLogs({ targets: markets, eventAbi: event_deposit, flatten: false, })
  logs.forEach((logs: any, index: number) => {
    logs.forEach((log: any) => dailyVolume.add(tokens[index], log.deposit))
  })


  return {    dailyVolume,    timestamp,  };
};

export default fetch;
