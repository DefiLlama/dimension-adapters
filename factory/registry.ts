import { SimpleAdapter } from "../adapters/types";

/**
 * Interface that all factories must implement
 */
export interface FactoryAdapter {
  protocolList: string[];
  getAdapter: (protocolName: string) => SimpleAdapter | undefined;
}

/**
 * Build a FactoryAdapter from a map of protocol names to SimpleAdapter instances.
 *
 * @param protocols - An object whose keys are protocol names and values are their corresponding `SimpleAdapter`
 * @returns A `FactoryAdapter` exposing `protocolList` (all protocol names) and `getAdapter(protocolName)` to retrieve an adapter by name
 */
export function createFactoryExports<T extends { [key: string]: SimpleAdapter }>(
  protocols: T
): FactoryAdapter {
  return {
    protocolList: Object.keys(protocols),
    getAdapter: (protocolName: string) => protocols[protocolName]
  };
}

// Simple mapping: adapter type -> array of factory filenames
// Factory files are stored in factory/{filename}.ts
// Legacy helpers are stored in helpers/{filename}.ts (marked with 'helpers/' prefix)
const factoriesByAdapterType: { [adapterType: string]: string[] } = {
  'fees': [
    // 'helpers/liquity',  // Legacy helper in helpers/ folder
  ],
  'dexs': [
    // 'normalizedVolume', // Factory in factory/ folder
  ],
  'aggregators': [],
  'open-interest': [],
  'normalized-volume': [
    'normalizedVolume', // Factory in factory/ folder
  ]
};

/**
 * Finds and returns a protocol adapter from registered factories for a given adapter type.
 *
 * @param adapterType - Adapter category key (for example, 'dexs', 'fees', 'normalized-volume')
 * @param protocolName - Protocol identifier to locate within the factories for the given adapter type
 * @returns The matching adapter and its factory name, or `null` if no adapter is found
 */
export function getAdapterFromHelpers(
  adapterType: string,
  protocolName: string
): { adapter: SimpleAdapter; factoryName: string } | null {
  const factories = factoriesByAdapterType[adapterType];
  if (!factories) return null;

  for (const factoryPath of factories) {
    try {
      // Determine import path and factory name
      const isHelper = factoryPath.startsWith('helpers/');
      const factoryName = isHelper ? factoryPath.replace('helpers/', '') : factoryPath;
      const importPath = isHelper ? `../helpers/${factoryName}` : `./${factoryName}`;
      
      // Dynamically import the factory
      const factory = require(importPath) as FactoryAdapter;
      
      if (!factory.protocolList || !factory.getAdapter) continue;
      
      if (factory.protocolList.includes(protocolName)) {
        const adapter = factory.getAdapter(protocolName);
        if (adapter) {
          return { adapter, factoryName };
        }
      }
    } catch (error) {
      // Skip if factory doesn't exist or has errors
      continue;
    }
  }
  
  return null;
}

/**
 * Enumerates all protocols exposed by factory helpers, optionally restricted to a specific adapter type.
 *
 * @param adapterType - Optional adapter category key to filter the results to a single adapter type.
 * @returns An array of protocol descriptors where each entry contains:
 * - `protocolName`: the protocol identifier string
 * - `factoryName`: the factory (or helper) module name that provides the protocol
 * - `adapterType`: the adapter category key under which the factory is registered
 * - `sourcePath`: the relative source file path for the factory (e.g., `helpers/{name}.ts` or `factory/{name}.ts`)
 */
export function listHelperProtocols(adapterType?: string): Array<{ 
  protocolName: string; 
  factoryName: string;
  adapterType: string;
  sourcePath: string;
}> {
  const protocols: any[] = [];
  
  const typesToCheck = adapterType 
    ? { [adapterType]: factoriesByAdapterType[adapterType] }
    : factoriesByAdapterType;
  
  for (const [type, factories] of Object.entries(typesToCheck)) {
    if (!factories) continue;
    
    for (const factoryPath of factories) {
      try {
        // Determine import path and factory name
        const isHelper = factoryPath.startsWith('helpers/');
        const factoryName = isHelper ? factoryPath.replace('helpers/', '') : factoryPath;
        const importPath = isHelper ? `../helpers/${factoryName}` : `./${factoryName}`;
        const sourcePath = isHelper ? `helpers/${factoryName}.ts` : `factory/${factoryName}.ts`;
        
        // Dynamically import the factory
        const factory = require(importPath) as FactoryAdapter;
        
        if (!factory.protocolList) continue;
        
        factory.protocolList.forEach(protocolName => {
          protocols.push({
            protocolName,
            factoryName,
            adapterType: type,
            sourcePath
          });
        });
      } catch (error) {
        // Skip if factory doesn't exist or has errors
        continue;
      }
    }
  }
  
  return protocols;
}

/**
 * Retrieve the list of factory identifiers for a given adapter category.
 *
 * @param adapterType - The adapter category key (e.g., "fees", "dexs", "aggregators").
 * @returns An array of factory path identifiers associated with the specified adapter type, or an empty array if none exist.
 */
export function getHelpersForAdapterType(adapterType: string): string[] {
  return factoriesByAdapterType[adapterType] || [];
}