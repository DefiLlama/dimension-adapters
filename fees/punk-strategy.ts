import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { ethers } from "ethers";
import ADDRESSES from '../helpers/coreAssets.json';

const ABI = {
  SWAP_EVENT: 'event Swap (bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)',
  PUNK_BOUGHT_EVENT: 'event PunkBought (uint256 indexed punkIndex, uint256 value, address indexed fromAddress, address indexed toAddress)'
};

const ADDRESS = {
  UNISWAP_POOL_MANAGER: "0x000000000004444c5dc75cB358380D2e3dE08A90",
  FEE_MANAGER: "0xfAaad5B731F52cDc9746F2414c823eca9B06E844",
  SWAP_TOPIC: '0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f',
  POOL_ID: '0xbdb0f9c31367485f85e691f638345f3de673a78effaff71ce34bc7ff1d54fddc',
  CRYPTO_PUNKS_NFT: '0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB',
  PUNK_STRATEGY_PATCH: '0x1244EAe9FA2c064453B5F605d708C0a0Bfba4838',
  PUNK_BOUGHT_TOPIC: '0x58e5d5a525e3b40bc15abaa38b5882678db1ee68befd2f60bafe3a7fd06db9e3'
}

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()

  const tradeFeeLogs = await options.getLogs({
    target: ADDRESS.UNISWAP_POOL_MANAGER,
    topics: [
      ADDRESS.SWAP_TOPIC,
      ADDRESS.POOL_ID,
      ethers.zeroPadValue(ADDRESS.FEE_MANAGER, 32)
    ],
    eventAbi: ABI.SWAP_EVENT
  });

  tradeFeeLogs.forEach((trade: any) => {
    dailyFees.add(ADDRESSES.ethereum.WETH, trade.amount0)
  });

  const nftSoldLogs = await options.getLogs({
    target: ADDRESS.CRYPTO_PUNKS_NFT,
    topics: [
      ADDRESS.PUNK_BOUGHT_TOPIC, 
      null as any, 
      ethers.zeroPadValue(ADDRESS.PUNK_STRATEGY_PATCH, 32), 
      null as any
    ]
  });

  dailyProtocolRevenue.add(dailyFees.clone(0.2));

  nftSoldLogs.forEach((nftSold: any) => {
    // Though the entire amount is used for buy-back and burn, we consider only 20% (profit) because the base amount is collected by PNKR trade fees which is indirectly paid by holders
    dailyFees.add(ADDRESSES.ethereum.WETH, nftSold.data / 6)
    dailyHoldersRevenue.add(ADDRESSES.ethereum.WETH, nftSold.data)
  })

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2025-09-06',
  methodology: {
    Fees: "10% fees (80% to buy punk nft and the 20% to the team) collected from PNKR trades on the Uniswap V4 pool and NFT sale profits which are sold at 1.2x the purchase price",
    Revenue: "20% of the swap fees going to team and the NFT sale profits which are used to buy-back and burn PNKSTR tokens",
    ProtocolRevenue: "20% of the swap fees going to the team.",
    HoldersRevenue: "NFT sale proceeds are used for buy-back and burn PNKSTR tokens",
  }
}

export default adapter;