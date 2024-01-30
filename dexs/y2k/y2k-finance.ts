import { FetchResultVolume } from "../../adapters/types";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../../helpers/getBlock";
import { Chain } from "@defillama/sdk/build/general";
import { getDeposits } from "./utils";

const vault_factory = "0x984e0eb8fb687afa53fc8b33e12e04967560e092";
const WETH = "0x82af49447d8a07e3bd95bd0d56f35241523fbab1";

const abis: any = {
  "getVaults": "function getVaults(uint256 index) view returns (address[] vaults)",
  "marketIndex": "uint256:marketIndex"
};

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultVolume> => {
    const fromTimestamp = timestamp - 60 * 60 * 24;
    const toTimestamp = timestamp;
    const fromBlock = await getBlock(fromTimestamp, chain, {});
    const toBlock = await getBlock(toTimestamp, chain, {});

    const poolLength = (
      await sdk.api2.abi.call({
        target: vault_factory,
        chain: chain,
        abi: abis.marketIndex,
      })
    );

    const vaultRes = await sdk.api2.abi.multiCall({
      abi: abis.getVaults,
      calls: Array.from(Array(Number(poolLength)).keys()).map((i: any) => ({
        target: vault_factory,
        params: i,
      })),
      chain: chain,
    });

    const vaults = vaultRes
      
      .flat()
      .map((e: string) => e.toLowerCase());

    const dailyVolume = await getDeposits(WETH, vaults, fromBlock, toBlock, timestamp);

    return {
      dailyVolume: `${dailyVolume}`,
      timestamp,
    };
  };
};

export default fetch;
