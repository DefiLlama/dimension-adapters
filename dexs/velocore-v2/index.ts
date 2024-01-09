import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ethers } from "ethers";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../../helpers/getBlock";
import { getPrices } from "../../utils/prices";

interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}

const abs = (a: number) => a < 0 ? -a : a;
const fetch = async (timestamp: number) => {
  try {
    let abi = ["event Swap(address indexed pool, address indexed user, bytes32[] tokenRef, int128[] delta)"];
    let iface = new ethers.Interface(abi);
    const volume: { [addr: string]: number } = ((await sdk.getEventLogs({
      target: "0x1d0188c4B276A09366D05d6Be06aF61a73bC7535",
      fromBlock: await getBlock(timestamp - 60 * 60 * 24, CHAIN.LINEA, {}),
      toBlock: await getBlock(timestamp, CHAIN.LINEA, {}),
      chain: CHAIN.LINEA,
      topics: ["0xbaec78ca3218aba6fc32d82b79acdd1a47663d7b8da46e0c00947206d08f2071"]
    }))as any as ILog[]).map((i) => {
      const e = iface.parseLog(i)!.args;
      let volume: { [addr: string]: number } = {};
      for (let i = 0; i < e.tokenRef.length; i++) {
        if (e.tokenRef[i].slice(2 + 24).toLowerCase() == e.pool.slice(2).toLowerCase()) {
          // this is lp deposit/withdrawal, not swap
          return {};
        }

        volume['0x' + e.tokenRef[i].slice(2 + 24)] = (volume['0x' + e.tokenRef[i].slice(2 + 24)] ?? 0) + abs(Number(e.delta[i]))
      }
      volume["0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f"] = volume["0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"]; // WETH
      delete volume["0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"];
      return volume;
    }).reduce((a, b) => {
      for (let i in b) {
        a[i] = (a[i] ?? 0) + (b[i]);
      }
      return a;
    }, {})
    let prices = await getPrices(Object.keys(volume).map((i) => `${CHAIN.LINEA}:${i}`), timestamp);
    const dailyVolume = Object.keys(volume).map((addr) => (prices[`${CHAIN.LINEA}:${addr}`]?.price * volume[addr] / 10 ** prices[`${CHAIN.LINEA}:${addr}`]?.decimals) || 0).reduce((a, b) => a + b, 0) / 2;
    return {
      dailyVolume: `${dailyVolume}`,
      timestamp,
    };
  } catch (error) {
    console.error(error);
    throw error;
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.LINEA]: {
      fetch,
      start: async () => 1690876967,
    },
  }
};

export default adapter;
