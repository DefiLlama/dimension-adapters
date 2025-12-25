import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

/**
 * Seamless Protocol - Morpho-based lending + leverage tokens
 * Fee sources:
 * 1. Morpho Vaults: Management fees (feeShares need conversion)
 * 2. LeverageManager: Leverage token operation fees
 */

const CONTRACTS = {
  [CHAIN.BASE]: {
    // Morpho Vaults (ERC4626) - generate management fees
    vaults: {
      usdc: {
        address: "0x616a4E1db48e22028f6bbf20444Cd3b8e3273738",
        underlyingToken: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC on Base
        decimals: 6,
      },
      cbBTC: {
        address: "0x5a47C803488FE2BB0A0EAaf346b420e4dF22F3C7",
        underlyingToken: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", // cbBTC on Base
        decimals: 8,
      },
      weth: {
        address: "0x27d8c7273fd3fcc6956a0b370ce5fd4a7fc65c18",
        underlyingToken: "0x4200000000000000000000000000000000000006", // WETH on Base
        decimals: 18,
      },
    },
    leverageManager: "0x38Ba21C6Bf31dF1b1798FCEd07B4e9b07C5ec3a8",
  },
};

// Morpho vault fee accrual event
const accrueInterestAbi = "event AccrueInterest(uint256 newTotalAssets, uint256 feeShares)";

// Leverage Manager fee event
const feeCollectedAbi = "event FeeCollected(address indexed token, uint256 amount)";

const fetch = async (options: any) => {
  const { createBalances, getLogs, chain, api } = options;
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();

  const contracts = CONTRACTS[chain as keyof typeof CONTRACTS];
  if (!contracts) {
    console.log(`[${chain}] No contracts configured`);
    return { dailyFees, dailyRevenue };
  }

  console.log(`\n[${chain}] Fetching Seamless Protocol fees...`);

  // Method 1: Track Morpho Vault fees (main revenue source)
  console.log(`[${chain}] Processing Morpho Vault fees...`);
  
  for (const [vaultName, vaultConfig] of Object.entries(contracts.vaults)) {
    try {
      const logs = await getLogs({
        target: vaultConfig.address,
        eventAbi: accrueInterestAbi,
      });

      if (logs.length > 0) {
        console.log(`[${chain}] ${vaultName.toUpperCase()} Vault: ${logs.length} fee events`);

        // Get vault share price to convert feeShares to underlying assets
        // totalAssets() / totalSupply() = price per share
        const totalAssets = await api.call({
          target: vaultConfig.address,
          abi: "function totalAssets() view returns (uint256)",
        });

        const totalSupply = await api.call({
          target: vaultConfig.address,
          abi: "function totalSupply() view returns (uint256)",
        });

        // Calculate total fee shares
        let totalFeeShares = 0n;
        logs.forEach((log: any) => {
          totalFeeShares += BigInt(log.feeShares);
        });

        // Convert feeShares to underlying asset amount
        // feeValue = (feeShares * totalAssets) / totalSupply
        if (totalSupply > 0n) {
          const feeValue = (totalFeeShares * BigInt(totalAssets)) / BigInt(totalSupply);
          
          console.log(`  -> Total Fee Shares: ${totalFeeShares.toString()}`);
          console.log(`  -> Share Price: ${totalAssets} / ${totalSupply}`);
          console.log(`  -> Fee Value: ${feeValue.toString()} (${vaultName})`);

          // Add to balances using underlying token
          dailyFees.add(vaultConfig.underlyingToken, feeValue.toString());
          dailyRevenue.add(vaultConfig.underlyingToken, feeValue.toString());
        } else {
          console.log(`  -> Warning: totalSupply is 0 for ${vaultName}`);
        }
      }
    } catch (error: any) {
      console.log(`[${chain}] ${vaultName} vault error:`, error.message || error);
    }
  }

  // Method 2: Track LeverageManager fees (secondary source)
  console.log(`[${chain}] Processing LeverageManager fees...`);
  try {
    const leverageLogs = await getLogs({
      target: contracts.leverageManager,
      eventAbi: feeCollectedAbi,
    });

    if (leverageLogs.length > 0) {
      console.log(`[${chain}] LeverageManager: ${leverageLogs.length} FeeCollected events`);
      
      leverageLogs.forEach((log: any) => {
        console.log(`  -> Token: ${log.token}, Amount: ${log.amount}`);
        dailyFees.add(log.token, log.amount);
        dailyRevenue.add(log.token, log.amount);
      });
    } else {
      console.log(`[${chain}] LeverageManager: No fees collected in this period`);
    }
  } catch (error: any) {
    console.log(`[${chain}] LeverageManager error:`, error.message || error);
  }

  console.log(`[${chain}] Fee collection complete\n`);

  return {
    dailyFees,
    dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2024-06-01",
    },
  },
  methodology: {
    Fees: `
      Seamless Protocol fees are tracked from two sources:
      
      1. Morpho Vaults (USDC, cbBTC, WETH): Management fees accrued as vault shares.
         Fee shares are converted to underlying asset amounts using the vault's 
         share price (totalAssets / totalSupply).
      
      2. LeverageManager: Fees from leverage token operations (mint/burn/rebalance).
      
      All fees represent protocol revenue as Seamless operates on a fee-based model.
    `,
    Revenue: `
      Protocol revenue equals total fees collected. 
    `,
  },
  version: 2,
};

export default adapter;