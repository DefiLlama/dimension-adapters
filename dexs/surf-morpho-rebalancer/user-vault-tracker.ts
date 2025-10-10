import { ChainApi } from '@defillama/sdk';
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json'

// Factory contract address
const FACTORY_ADDRESS = "0x1D283b668F947E03E8ac8ce8DA5505020434ea0E";

// Admin address that performs rebalancing
const ADMIN_ADDRESS = "0xEeEE7d713aDf6f408dd3637987191B35E3A872b0";

// Factory contract ABI
const FACTORY_ABI = {
  getTotalVaults: "function getTotalVaults() external view returns (uint256)",
  getVaultInfo: "function getVaultInfo(uint256 index) external view returns (tuple(address vaultAddress, address owner, address admin, uint256 chainId, bytes32 salt, uint256 deployedAt))"
};

// UserVault contract ABI
const USER_VAULT_ABI = {
  currentVault: "function currentVault() external view returns (address)"
};

// VaultInfo struct type
interface VaultInfo {
  vaultAddress: string;
  owner: string;
  admin: string;
  chainId: number;
  salt: string;
  deployedAt: number;
}

// Extended vault info with current Morpho vault
interface ExtendedVaultInfo extends VaultInfo {
  currentMorphoVault: string;
}

// USDC token address for different chains
const USDC_ADDRESSES = {
  [CHAIN.ETHEREUM]: ADDRESSES.ethereum.USDC,
  [CHAIN.ARBITRUM]: ADDRESSES.arbitrum.USDC,
  [CHAIN.BASE]: ADDRESSES.base.USDC,
  [CHAIN.POLYGON]: ADDRESSES.polygon.USDC,
  [CHAIN.OPTIMISM]: ADDRESSES.optimism.USDC,
  [CHAIN.BSC]: ADDRESSES.bsc.USDC,
};

export class UserVaultTracker {
  private api: ChainApi;
  private chain: string;

  constructor(chain: string) {
    this.chain = chain;
    this.api = new ChainApi({ chain });
  }

  /**
   * Get total number of vaults deployed by the factory
   */
  async getTotalVaults(): Promise<number> {
    try {
      console.log(`🔍 Getting total vaults from factory ${FACTORY_ADDRESS}...`);
      const totalVaults = await this.api.call({
        target: FACTORY_ADDRESS,
        abi: FACTORY_ABI.getTotalVaults,
      });
      const count = Number(totalVaults);
      console.log(`📊 Total vaults found: ${count}`);
      return count;
    } catch (error) {
      console.error(`❌ Error getting total vaults on ${this.chain}:`, error);
      return 0;
    }
  }

  /**
   * Get vault information by index
   */
  async getVaultInfo(index: number): Promise<VaultInfo | null> {
    try {
      const vaultInfo = await this.api.call({
        target: FACTORY_ADDRESS,
        abi: FACTORY_ABI.getVaultInfo,
        params: [index],
      }) as VaultInfo;

      return vaultInfo;
    } catch (error) {
      console.error(`❌ Error getting vault info for index ${index} on ${this.chain}:`, error);
      return null;
    }
  }

  /**
   * Get current Morpho vault address for a UserVault
   */
  async getCurrentMorphoVault(vaultAddress: string): Promise<string | null> {
    try {
      const currentVault = await this.api.call({
        target: vaultAddress,
        abi: USER_VAULT_ABI.currentVault,
      });

      return currentVault as string;
    } catch (error) {
      console.error(`❌ Error getting current vault for ${vaultAddress} on ${this.chain}:`, error);
      return null;
    }
  }

  /**
   * Get all vaults with their current Morpho vault addresses
   */
  async getAllUserVaults(): Promise<ExtendedVaultInfo[]> {
    console.log(`\n🏭 SURF MORPHO USER VAULT TRACKER`);
    console.log(`=================================`);
    console.log(`Factory Address: ${FACTORY_ADDRESS}`);
    console.log(`Chain: ${this.chain}`);
    console.log(`Admin Address: ${ADMIN_ADDRESS}\n`);
    
    const totalVaults = await this.getTotalVaults();
    
    if (totalVaults === 0) {
      console.log(`❌ No vaults found in factory`);
      return [];
    }

    const allVaults: ExtendedVaultInfo[] = [];
    console.log(`\n🔍 Fetching vault details...`);

    for (let i = 0; i < totalVaults; i++) {
      process.stdout.write(`\r📋 Processing vault ${i + 1}/${totalVaults}...`);
      
      const vaultInfo = await this.getVaultInfo(i);
      if (!vaultInfo) {
        console.warn(`\n⚠️ Failed to get vault info for index ${i}`);
        continue;
      }

      const currentMorphoVault = await this.getCurrentMorphoVault(vaultInfo.vaultAddress);
      
      const extendedVaultInfo: ExtendedVaultInfo = {
        ...vaultInfo,
        currentMorphoVault: currentMorphoVault || 'N/A'
      };

      allVaults.push(extendedVaultInfo);
    }

    console.log(`\n✅ Successfully processed ${allVaults.length} vaults!`);
    return allVaults;
  }

  /**
   * Get vaults by owner address
   */
  async getVaultsByOwner(ownerAddress: string): Promise<ExtendedVaultInfo[]> {
    const allVaults = await this.getAllUserVaults();
    return allVaults.filter(vault => 
      vault.owner.toLowerCase() === ownerAddress.toLowerCase()
    );
  }

  /**
   * Get vaults by admin address
   */
  async getVaultsByAdmin(adminAddress: string): Promise<ExtendedVaultInfo[]> {
    const allVaults = await this.getAllUserVaults();
    return allVaults.filter(vault => 
      vault.admin.toLowerCase() === adminAddress.toLowerCase()
    );
  }

  /**
   * Get vaults by current Morpho vault
   */
  async getVaultsByMorphoVault(morphoVaultAddress: string): Promise<ExtendedVaultInfo[]> {
    const allVaults = await this.getAllUserVaults();
    return allVaults.filter(vault => 
      vault.currentMorphoVault.toLowerCase() === morphoVaultAddress.toLowerCase()
    );
  }

  /**
   * Get comprehensive vault summary
   */
  async getVaultSummary(): Promise<{
    totalVaults: number;
    uniqueOwners: number;
    uniqueAdmins: number;
    uniqueMorphoVaults: number;
    vaultsByChain: Record<number, number>;
    adminVaults: number;
    recentVaults: ExtendedVaultInfo[];
  }> {
    const allVaults = await this.getAllUserVaults();
    
    const uniqueOwners = new Set(allVaults.map(v => v.owner)).size;
    const uniqueAdmins = new Set(allVaults.map(v => v.admin)).size;
    const uniqueMorphoVaults = new Set(
      allVaults
        .map(v => v.currentMorphoVault)
        .filter(v => v !== 'N/A')
    ).size;

    const vaultsByChain = allVaults.reduce((acc, vault) => {
      acc[vault.chainId] = (acc[vault.chainId] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    const adminVaults = allVaults.filter(v => 
      v.admin.toLowerCase() === ADMIN_ADDRESS.toLowerCase()
    ).length;

    // Get recent vaults (last 10)
    const recentVaults = allVaults
      .sort((a, b) => b.deployedAt - a.deployedAt)
      .slice(0, 10);

    return {
      totalVaults: allVaults.length,
      uniqueOwners,
      uniqueAdmins,
      uniqueMorphoVaults,
      vaultsByChain,
      adminVaults,
      recentVaults
    };
  }

  /**
   * Display detailed vault information
   */
  async displayVaultDetails(): Promise<void> {
    const allVaults = await this.getAllUserVaults();
    
    if (allVaults.length === 0) {
      console.log(`❌ No vaults found`);
      return;
    }

    const summary = await this.getVaultSummary();
    
    console.log(`\n📊 VAULT SUMMARY:`);
    console.log(`================`);
    console.log(`Total Vaults: ${summary.totalVaults}`);
    console.log(`Unique Owners: ${summary.uniqueOwners}`);
    console.log(`Unique Admins: ${summary.uniqueAdmins}`);
    console.log(`Unique Morpho Vaults: ${summary.uniqueMorphoVaults}`);
    console.log(`Admin Vaults: ${summary.adminVaults}`);
    console.log(`Vaults by Chain:`, summary.vaultsByChain);

    // Display all vaults
    console.log(`\n📋 ALL USER VAULTS:`);
    console.log(`==================`);
    allVaults.forEach((vault, index) => {
      console.log(`\n${index + 1}. Vault Address: ${vault.vaultAddress}`);
      console.log(`   Owner: ${vault.owner}`);
      console.log(`   Admin: ${vault.admin}`);
      console.log(`   Chain ID: ${vault.chainId}`);
      console.log(`   Current Morpho Vault: ${vault.currentMorphoVault}`);
      console.log(`   Deployed At: ${new Date(vault.deployedAt * 1000).toISOString()}`);
      console.log(`   Salt: ${vault.salt}`);
      console.log(`   Is Admin Vault: ${vault.admin.toLowerCase() === ADMIN_ADDRESS.toLowerCase() ? '✅ YES' : '❌ NO'}`);
    });

    // Display admin vaults specifically
    const adminVaults = allVaults.filter(v => 
      v.admin.toLowerCase() === ADMIN_ADDRESS.toLowerCase()
    );

    if (adminVaults.length > 0) {
      console.log(`\n🎯 VAULTS MANAGED BY ADMIN (${ADMIN_ADDRESS}):`);
      console.log(`=============================================`);
      adminVaults.forEach((vault, index) => {
        console.log(`\n${index + 1}. Vault: ${vault.vaultAddress}`);
        console.log(`   Owner: ${vault.owner}`);
        console.log(`   Current Morpho Vault: ${vault.currentMorphoVault}`);
        console.log(`   Deployed: ${new Date(vault.deployedAt * 1000).toISOString()}`);
      });
    } else {
      console.log(`\n⚠️ No vaults found managed by admin address ${ADMIN_ADDRESS}`);
    }
  }
}

// Main execution function
export async function trackAllUserVaults(chain: string = CHAIN.BASE): Promise<ExtendedVaultInfo[]> {
  console.log(`🚀 Starting User Vault Tracking on ${chain}`);
  console.log(`==========================================\n`);
  
  const tracker = new UserVaultTracker(chain);
  
  try {
    await tracker.displayVaultDetails();
    const allVaults = await tracker.getAllUserVaults();
    
    console.log(`\n✅ Tracking completed successfully!`);
    console.log(`📊 Found ${allVaults.length} user vaults total`);
    
    return allVaults;
  } catch (error) {
    console.error(`❌ Error tracking vaults:`, error);
    return [];
  }
}

// Export for use in other files
export { 
  FACTORY_ADDRESS, 
  ADMIN_ADDRESS, 
  FACTORY_ABI, 
  USER_VAULT_ABI, 
  USDC_ADDRESSES 
};
export type { VaultInfo, ExtendedVaultInfo };

// Run if this file is executed directly
if (require.main === module) {
  trackAllUserVaults(CHAIN.BASE)
    .then((vaults) => {
      console.log(`\n🎉 Process completed! Found ${vaults.length} vaults.`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(`❌ Process failed:`, error);
      process.exit(1);
    });
}
