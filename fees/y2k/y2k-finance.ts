import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchResultFees } from "../../adapters/types";
import { ethers } from "ethers";

const vault_factory = "0x984e0eb8fb687afa53fc8b33e12e04967560e092";

const abis: any = {
  "getVaults": "function getVaults(uint256 index) view returns (address[] vaults)",
  "marketIndex": "uint256:marketIndex"
};

const tokens = [
  ADDRESSES.arbitrum.ARB, // ARB
  ADDRESSES.arbitrum.WETH, // WETH
];
const treasury = "0x5c84cf4d91dc0acde638363ec804792bb2108258";
const topic0_transfer = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const event_transfer = "event Transfer (address indexed from, address indexed to, uint256 amount)";


const fetch = async (timestamp: number, _, { api, createBalances, getLogs, }): Promise<FetchResultFees> => {
  const vaultRes = await api.fetchList({ lengthAbi: abis.marketIndex, itemAbi: abis.getVaults, target: vault_factory })

  const vaults = vaultRes
    .flat()
    .map((e: string) => e.toLowerCase());
  const dailyFees = createBalances()

  for (const token of tokens) {
    for (const vault of vaults) {
      const transfer_treasury = await getLogs({
        target: token,
        eventAbi: event_transfer,
        topics: [topic0_transfer, ethers.zeroPadValue(vault, 32), ethers.zeroPadValue(treasury, 32)],
      })
      transfer_treasury.forEach((i: any) => api.add(token, i.amount))
    }
  }

  return { dailyFees, dailyRevenue: dailyFees, timestamp, };
};

export default fetch;
