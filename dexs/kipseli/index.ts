import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";
import { ethers } from "ethers";

const router = "0x054F0377e07d2F460151F935Dffc4D880017E63a";
const swapTopic = "0xa441699ef46589494a7167a03b4dc78a5adfb1dbf33323acd42fbdd30a27c5b0";
const swapEventTypes = ["address", "address", "uint256", "uint256"];

async function fetch(options: FetchOptions) {
  const { getLogs, createBalances } = options;
  const dailyVolume = createBalances();
  const logs = await getLogs({ target: router, topics: [swapTopic], entireLog: true });
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();

  logs.forEach((log: any) => {
    const [token0, token1, amount0, amount1] = abiCoder.decode(swapEventTypes, log.data);

    addOneToken({
      chain: options.chain,
      balances: dailyVolume,
      token0: token0,
      amount0: amount0,
      token1: token1,
      amount1: amount1
    })
  });
  return { dailyVolume };
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  pullHourly: true,
  chains: [CHAIN.ETHEREUM],
  start: "2026-05-12",
};

export default adapter;
