import { getAdapterFromHelpers, listHelperProtocols } from "../../factory/registry";
import { SimpleAdapter } from "../types";

export interface ImportAdapterResult {
  adapter: SimpleAdapter;
  source: 'file' | 'factory';
  factoryName?: string;
}

/**
 * Import an adapter by trying file-based lookup first, then factory registry
 * @param adapterType - The adapter type (e.g., 'fees', 'dexs', 'normalized-volume')
 * @param protocolName - The protocol name
 * @param filePath - The file path to try importing from (relative to project root)
 * @returns ImportAdapterResult with adapter and source information
 * @throws Error if adapter is not found
 */
export async function importAdapter(
  adapterType: string,
  protocolName: string,
  filePath: string
): Promise<ImportAdapterResult> {
  try {
    // Try to import the individual file first
    const adapterModule = (await import(filePath)).default;
    return {
      adapter: adapterModule,
      source: 'file'
    };
  } catch (error) {
    // File doesn't exist, try to find it in factory registry
    const result = getAdapterFromHelpers(adapterType, protocolName);
    
    if (!result) {
      // Only show error if not found in registry either
      const errorMessage = `❌ Protocol "${protocolName}" not found in ${adapterType}/ or factory registry`;
      throw new Error(errorMessage);
    }
    
    return {
      adapter: result.adapter,
      source: 'factory',
      factoryName: result.factoryName
    };
  }
}
