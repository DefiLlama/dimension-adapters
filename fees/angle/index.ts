import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

// Angle Protocol Fee Collection Contracts
// VaultManager contracts collect fees from minting, burning, and liquidations
// Transmuter contracts collect redemption/swap fees
const FEE_RECIPIENT_ADDRESSES = [
  // VaultManager contracts (collect mint fees, stability fees, repay fees, liquidation surcharges)
  '0x9F8E8f9Dc4F5aB87068279D707C2a2b0e8c37EaD', // VaultManager_USDC_Llama
  '0x5adDc89785D75C86aB939E9e15bfBBb7Fc086A87', // VaultManager_wstETH
  '0x3f66867b4d7221701695d565E1823B6D6De74070', // VaultManager_cbETH
  '0x53b981AB0FAd9A51c541387f6FAF9B6F34e58e6b', // VaultManager_WBTC
  '0x9cE7eE7D0a62A1Af5F4e48e9B4ba3A8f80FdaD00', // VaultManager_wstETH_2
  
  // Transmuter contracts (collect redemption and swap fees)
  '0x222222fD79264BBE280b4986F6FEfBC3524d0137', // Transmuter USDA
  '0x00253582b2a3FE112feEC532221d9708c64cEFAb', // Transmuter EUR (EURA)
];

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();

    // Get all tokens received by fee collection contracts
    // These contracts accumulate protocol fees from various operations:
    // - VaultManagers: mint fees, repay fees, liquidation surcharges, stability fees
    // - Transmuters: redemption fees, swap fees
    await addTokensReceived({
        options,
        targets: FEE_RECIPIENT_ADDRESSES,
        balances: dailyFees
    });

    return {
        dailyFees,
        dailyRevenue: dailyFees,
    };
}

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch,
            start: '2023-08-08',
        },
    },
    version: 2
}

export default adapter;