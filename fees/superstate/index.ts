import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";

const USTB = {
  ethereum: "0x43415eB6ff9DB7E26A15b704e7A3eDCe97d31C4e",
  plume_mainnet: "0xe4fa682f94610ccd170680cc3b045d77d9e528a8",
};
const USTB_CHAINLINK_ORACLE = "0xE4fA682f94610cCd170680cc3B045d77D9E528a8";
const PRICING_ABI = "function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)";

async function getPrices(timestamp: number): Promise<number> {
  const blockNumber = await sdk.blocks.getBlockNumber(CHAIN.ETHEREUM, timestamp);

  const price = await sdk.api.abi.call({
    chain: CHAIN.ETHEREUM,
    abi: PRICING_ABI,
    target: USTB_CHAINLINK_ORACLE,
    block: blockNumber
  });
  return price.output[1] / 1e6;
}

const fetch = async (options: FetchOptions) => {
  const priceYesterday = await getPrices(options.fromTimestamp);
  const priceToday = await getPrices(options.toTimestamp);

  let totalSupply = await options.api.call({
    abi: "uint256:totalSupply",
    target: USTB[options.chain],
  });

  totalSupply /= 1e6;
  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(totalSupply * (priceToday - priceYesterday));

  const dailyRevenue = options.createBalances();
  const oneYear = 365 * 24 * 60 * 60;
  const timeFrame = options.toTimestamp - options.fromTimestamp;
  dailyRevenue.addUSDValue((totalSupply * priceToday * 0.0015 * timeFrame) / oneYear);
  dailyFees.add(dailyRevenue);

  return {
    dailyFees,
    dailyRevenue,
  };
};

const methodology = {
  Fees: "Total Yields from RWA Yields",
  Revenue: "0.15% Annual Management fee collected by superstate",
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  fetch,
  chains: [CHAIN.ETHEREUM, CHAIN.PLUME],
  start: "2024-02-14",
};

export default adapter;
