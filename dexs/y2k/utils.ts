import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getPrices } from "../../utils/prices";
import { ethers } from "ethers";

const treasury = "0x5c84cf4d91dc0acde638363ec804792bb2108258";
const topic0_transfer = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const topic0_deposit = "0xdcbc1c05240f31ff3ad067ef1ee35ce4997762752e3a095284754544f4c709d7";

const event_transfer = "event Transfer (address indexed from, address indexed to, uint256 amount)";
const event_deposit = "event Deposit (address indexed user, address indexed receiver, uint256 id, uint256 assets)";

export interface ITx {
  topics: string[];
  data: string;
  transactionHash: string;
}

const transfer_interface = new ethers.Interface([event_transfer]);
const deposit_interface = new ethers.Interface([event_deposit]);

export const getDeposits = async (
  token: string,
  vaults: string[],
  fromBlock: number,
  toBlock: number,
  timestamp: number
): Promise<number> => {
  const coins: string[] = [`${CHAIN.ARBITRUM}:${token}`];
  const prices = await getPrices(coins, timestamp);
  const price = prices[`${CHAIN.ARBITRUM}:${token}`].price;
  const decimals = prices[`${CHAIN.ARBITRUM}:${token}`].decimals;

  let totalDeposits = 0;
  for (const vault of vaults) {
    const logs_deposit: ITx[] = (
      await sdk.getEventLogs({
        target: vault,
        fromBlock: fromBlock,
        toBlock: toBlock,
        topics: [topic0_deposit],
        chain: CHAIN.ARBITRUM,
      })
    ) as ITx[];

    const deposits = logs_deposit.map((e) => deposit_interface.parseLog(e)!.args);
    const deposit = deposits.reduce((a, b) => a + Number(b.assets), 0);
    totalDeposits += (Number(deposit) / 10 ** decimals) * price;
  }
  return totalDeposits;
};
