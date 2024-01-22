import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";
import { ethers } from "ethers";

const tokens = [
  "0x912ce59144191c1204e64559fe8253a0e49e6548", // ARB
  "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
];
const treasury = "0x5c84cf4d91dc0acde638363ec804792bb2108258";
const topic0_transfer = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const event_transfer = "event Transfer (address indexed from, address indexed to, uint256 amount)";

export interface ITx {
  topics: string[];
  data: string;
  transactionHash: string;
}

export const getFees = async (
  vaults: string[],
  fromBlock: number,
  toBlock: number,
  timestamp: number
): Promise<number> => {
  const api = new sdk.ChainApi({ chain: CHAIN.ARBITRUM, timestamp });

  for (const token of tokens) {
    for (const vault of vaults) {
      const transfer_treasury = await api.getLogs({
        target: token,
        fromBlock: fromBlock,
        toBlock: toBlock,
        onlyArgs: true,
        eventAbi: event_transfer,
        topics: [topic0_transfer, ethers.zeroPadValue(vault, 32), ethers.zeroPadValue(treasury, 32)],
        chain: CHAIN.ARBITRUM,
      })
      transfer_treasury.forEach((i: any) => api.add(token, i.amount))
    }
  }
  return api.getUSDValue();
};
