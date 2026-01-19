import { SimpleAdapter } from "../adapters/types";

/**
 * Interface that all factories must implement
 */
export interface FactoryAdapter {
  protocolList: string[];
  getAdapter: (protocolName: string) => SimpleAdapter | undefined;
}

/**
 * Helper to create protocolList and getAdapter from a protocols map
 * This eliminates boilerplate in individual factory files
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
    'helpers/liquity',  // Legacy helper in helpers/ folder
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
 * Get adapter from any factory by protocol name
 * This is the fallback when individual file doesn't exist
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
 * List all protocols available in factories for a given adapter type
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
 * Get all factories for a specific adapter type (for buildModules)
 */
export function getHelpersForAdapterType(adapterType: string): string[] {
  return factoriesByAdapterType[adapterType] || [];
}
