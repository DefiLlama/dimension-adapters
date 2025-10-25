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
    const totalVaults = await this.api.call({
      target: FACTORY_ADDRESS,
      abi: FACTORY_ABI.getTotalVaults,
    });
    const count = Number(totalVaults);
    return count;
  }

  /**
   * Get vault information by index
   */
  async getVaultInfo(index: number): Promise<VaultInfo | null> {
    const vaultInfo = await this.api.call({
      target: FACTORY_ADDRESS,
      abi: FACTORY_ABI.getVaultInfo,
      params: [index],
    }) as VaultInfo;

    return vaultInfo;
  }

  /**
   * Get current Morpho vault address for a UserVault
   */
  async getCurrentMorphoVault(vaultAddress: string): Promise<string | null> {
    const currentVault = await this.api.call({
      target: vaultAddress,
      abi: USER_VAULT_ABI.currentVault,
    });

    return currentVault as string;
  }

  /**
   * Get all vaults with their current Morpho vault addresses
   */
  async getAllUserVaults(): Promise<ExtendedVaultInfo[]> {
    const totalVaults = await this.getTotalVaults();
    
    if (totalVaults === 0) {
      return [];
    }

    const allVaults: ExtendedVaultInfo[] = [];

    // Process vaults in batches to avoid overwhelming the API
    const batchSize = 10;
    for (let i = 0; i < totalVaults; i += batchSize) {
      const batchEnd = Math.min(i + batchSize, totalVaults);
      
      const batchPromises: Promise<ExtendedVaultInfo | null>[] = [];
      for (let j = i; j < batchEnd; j++) {
        batchPromises.push(this.processVault(j));
      }
      
      const batchResults = await Promise.allSettled(batchPromises);
      batchResults.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          allVaults.push(result.value);
        }
      });
    }

    return allVaults;
  }

  /**
   * Process a single vault
   */
  private async processVault(index: number): Promise<ExtendedVaultInfo | null> {
    const vaultInfo = await this.getVaultInfo(index);
    
    if (!vaultInfo) {
      return null;
    }

    const currentMorphoVault = await this.getCurrentMorphoVault(vaultInfo.vaultAddress);
    
    return {
      ...vaultInfo,
      currentMorphoVault: currentMorphoVault || 'N/A'
    };
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
   * Get vault summary data
   */
  async getVaultSummaryData(): Promise<{
    totalVaults: number;
    uniqueOwners: number;
    uniqueAdmins: number;
    uniqueMorphoVaults: number;
    vaultsByChain: Record<number, number>;
    adminVaults: number;
    recentVaults: ExtendedVaultInfo[];
  }> {
    const allVaults = await this.getAllUserVaults();
    return await this.getVaultSummary();
  }
}

// Main execution function
export async function trackAllUserVaults(chain: string = CHAIN.BASE): Promise<ExtendedVaultInfo[]> {
  const tracker = new UserVaultTracker(chain);
  const allVaults = await tracker.getAllUserVaults();
  console.log(`Total user vaults: ${allVaults.length}`);
  return allVaults;
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
  trackAllUserVaults(CHAIN.BASE);
}
