import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json';
import { ethers } from "ethers";

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

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
    const dailyFees = options.createBalances();
    const dailyHoldersRevenue = options.createBalances();

    const tradeFeeLogs = await options.getLogs({
        target: ADDRESS.UNISWAP_POOL_MANAGER,
        topics: [ADDRESS.SWAP_TOPIC,
        ADDRESS.POOL_ID,
        ethers.zeroPadValue(ADDRESS.FEE_MANAGER, 32)
        ],
        eventAbi: ABI.SWAP_EVENT
    });

    const nftSoldLogs = await options.getLogs({
        target: ADDRESS.CRYPTO_PUNKS_NFT,
        topics: [ADDRESS.PUNK_BOUGHT_TOPIC, null as any, ethers.zeroPadValue(ADDRESS.PUNK_STRATEGY_PATCH, 32), null as any]
    });

    tradeFeeLogs.forEach((trade: any) => {
        dailyFees.add(ADDRESSES.ethereum.WETH, trade.amount0)
    });

    nftSoldLogs.forEach((nftSold: any) => {
        //Though the entire amount is used for buy-back and burn, we consider only 20% (profit) because the base amount is collected by PNKR trade fees which is indirectly paid by holders
        dailyHoldersRevenue.add(ADDRESSES.ethereum.WETH, nftSold.data * (1 - 1 / 1.2))
    })

    const dailyProtocolRevenue = dailyFees.clone(0.2);
    dailyFees.add(dailyHoldersRevenue);

    const dailyRevenue = dailyProtocolRevenue.clone();
    dailyRevenue.add(dailyHoldersRevenue);

    return {
        dailyFees,
        dailyRevenue,
        dailyHoldersRevenue,
        dailyProtocolRevenue
    }
}

const methodology = {
    Fees: "Includes 10% fees collected from PNKR trades on the Uniswap V4 pool and NFT sale profits which are sold at 1.2x the purchase price.",
    Revenue: "Includes 20% of the fees collected by the protocol and the NFT sale profits which are used to buy-back and burn PNKR tokens.",
    HoldersRevenue: "Includes the revenue used to buy-back and burn PNKR tokens from the NFT sale profits.",
    ProtocolRevenue: "Includes 20% of the fees collected by the protocol.",
};

const adapter: Adapter = {
    version: 2,
    fetch,
    methodology,
    chains: [CHAIN.ETHEREUM],
    start: '2025-09-06'
}

export default adapter;
