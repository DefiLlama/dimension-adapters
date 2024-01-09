import { FetchResultVolume } from "../../adapters/types";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../../helpers/getBlock";
import { Chain } from "@defillama/sdk/build/general";
import { getDeposits } from "./utils";

const topic0 = "0x4c48fdcd7e3cb84b81aa54aa5dd04105736ae1bc179d84611c6fa5a642e803f2";
const controller_address = "0x225acf1d32f0928a96e49e6110aba1fdf777c85f";
const vault_factory = "0x984e0eb8fb687afa53fc8b33e12e04967560e092";
const WETH = "0x82af49447d8a07e3bd95bd0d56f35241523fbab1";

const abis: any = {
  getVaults: {
    inputs: [
      {
        internalType: "uint256",
        name: "index",
        type: "uint256",
      },
    ],
    name: "getVaults",
    outputs: [
      {
        internalType: "address[]",
        name: "vaults",
        type: "address[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  marketIndex: {
    inputs: [],
    name: "marketIndex",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
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
