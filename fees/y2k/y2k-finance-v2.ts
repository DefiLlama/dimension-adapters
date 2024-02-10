import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchResultFees } from "../../adapters/types";
import { ethers } from "ethers";

const factory = "0xC3179AC01b7D68aeD4f27a19510ffe2bfb78Ab3e";
const event_market_create =
  "event MarketCreated (uint256 indexed marketId, address premium, address collateral, address underlyingAsset, address token, string name, uint256 strike, address controller)";

const tokens = [
  ADDRESSES.arbitrum.ARB, // ARB
  ADDRESSES.arbitrum.WETH, // WETH
];
const treasury = "0x5c84cf4d91dc0acde638363ec804792bb2108258";
const topic0_transfer = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const event_transfer = "event Transfer (address indexed from, address indexed to, uint256 amount)";


const fetch = async (timestamp: number, _, { getLogs, api, createBalances, }): Promise<FetchResultFees> => {

  const market_create = await getLogs({
    target: factory,
    fromBlock: 96059531,
    eventAbi: event_market_create,
    cacheInCloud: true,
  })

  const premium = market_create.map((e: any) => e.premium.toLowerCase());
  const collateral = market_create.map((e: any) => e.collateral.toLowerCase());
  const vaults = [...new Set([...premium, ...collateral])];
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
