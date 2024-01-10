import { FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../../helpers/getBlock";
import { ethers } from "ethers";
import { getFees, ITx } from "./utils";

const controller_address = "0xC0655f3dace795cc48ea1E2e7BC012c1eec912dC";
const factory = "0xC3179AC01b7D68aeD4f27a19510ffe2bfb78Ab3e";
const topic0_market_create = "0xe8066e93c2c1e100c0c76002a546075b7c6b53025db53708875180c81afda250";
const topic0 = "0x4b66c73cef2a561fd3c21c2af17630b43dddcff66e6803219be3989857b29e80";
const event_market_create =
  "event MarketCreated (uint256 indexed marketId, address premium, address collateral, address underlyingAsset, address token, string name, uint256 strike, address controller)";

const contract_interface = new ethers.Interface([event_market_create]);

const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24;
  const toTimestamp = timestamp;

  const fromBlock = await getBlock(fromTimestamp, CHAIN.ARBITRUM, {});
  const toBlock = await getBlock(toTimestamp, CHAIN.ARBITRUM, {});

  const logs_market_create: ITx[] = (
    await sdk.getEventLogs({
      target: factory,
      fromBlock: 96059531,
      toBlock: toBlock,
      topics: [topic0_market_create],
      chain: CHAIN.ARBITRUM,
    })
  ) as ITx[];

  const market_create = logs_market_create.map((e) => contract_interface.parseLog(e)!.args);
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
