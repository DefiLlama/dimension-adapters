import { FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../../helpers/getBlock";
import { getFees, } from "./utils";

const factory = "0xC3179AC01b7D68aeD4f27a19510ffe2bfb78Ab3e";
const event_market_create =
  "event MarketCreated (uint256 indexed marketId, address premium, address collateral, address underlyingAsset, address token, string name, uint256 strike, address controller)";


const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24;
  const toTimestamp = timestamp;

  const fromBlock = await getBlock(fromTimestamp, CHAIN.ARBITRUM, {});
  const toBlock = await getBlock(toTimestamp, CHAIN.ARBITRUM, {});

  const market_create = await sdk.getEventLogs({
    target: factory,
    fromBlock: 96059531,
    toBlock: toBlock,
    eventAbi: event_market_create,
    chain: CHAIN.ARBITRUM,
    onlyArgs: true,
  })

  const premium = market_create.map((e: any) => e.premium.toLowerCase());
  const collateral = market_create.map((e: any) => e.collateral.toLowerCase());
  const vaults = [...new Set([...premium, ...collateral])];
  const dailyFees = await getFees(vaults, fromBlock, toBlock, timestamp);

  return {
    dailyFees: `${dailyFees}`,
    dailyRevenue: `${dailyFees}`,
    timestamp,
  };
};

export default fetch;
