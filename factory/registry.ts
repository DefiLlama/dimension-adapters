import { AdapterType, SimpleAdapter } from "../adapters/types";
import deadAdapters from './deadAdapters.json'
export { deadAdapters}

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

// Resolve factory path into import path, factory name, and optional named export
// Supports: 'helpers/name', 'name', 'name:export' (named export from factory file)
function resolveFactoryPath(factoryPath: string) {
  const [pathPart, exportName] = factoryPath.split(':');
  const isHelper = pathPart.startsWith('helpers/');
  const factoryName = isHelper ? pathPart.replace('helpers/', '') : pathPart;
  const importPath = isHelper ? `../helpers/${factoryName}` : `./${factoryName}`;
  return { importPath, factoryName, exportName };
}

// Simple mapping: adapter type -> array of factory filenames
// Factory files are stored in factory/{filename}.ts
// Legacy helpers are stored in helpers/{filename}.ts (marked with 'helpers/' prefix)
// Use 'name:export' to reference a named export (e.g. 'uniV2:fees')
const factoriesByAdapterType: { [adapterType: string]: string[] } = {
  'fees': [
    'helpers/liquity',
    'helpers/balancer',
    'helpers/friend-tech',
    'helpers/solidly',
    'uniV2:fees',
    'uniV3:fees',
    'uniV2',
    'uniV3',
    'blockscout',
    'hyperliquid:fees',
    'hyperliquid',
    'symmio:fees',
    'compoundV2',
    'orderly',
    'gmxV1',
    'chainTxFees',
    'curators',
    'saddle',
    'solLst',
  ],
  'dexs': [
    'helpers/balancer',
    'uniV2',
    'uniV3',
    'uniV2:fees',
    'uniV3:fees',
    'hyperliquid',
    'symmio',
    'orderly',
    'gmxV1',
    'polymarket',
    'saddle',
    'alliumSolanaDex',
  ],
  'aggregators': [],
  'open-interest': [
    'hyperliquid:oi',
  ],
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
  if (adapterType ===  AdapterType.DERIVATIVES) 
    adapterType = AdapterType.DEXS; // for now, we are putting derivatives in dexs, so we need to check there as well

  if ((deadAdapters as any)[adapterType]?.[protocolName]) {
    return {
      factoryName: 'deadAdapter',
      adapter: (deadAdapters as any)[adapterType][protocolName]
    }
  }

  const factories = factoriesByAdapterType[adapterType];
  if (!factories) return null;

  for (const factoryPath of factories) {
    try {
      const { importPath, factoryName, exportName } = resolveFactoryPath(factoryPath);

      // Dynamically import the factory
      const factoryModule = require(importPath);
      const factory = (exportName ? factoryModule[exportName] : factoryModule) as FactoryAdapter;

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

  // iterate through AdapterTypes to see if it matches anything else
  for (const deadProtocols of Object.values((deadAdapters as any))) {
    if ((deadProtocols as any)[protocolName])
      return {
        factoryName: 'deadAdapter',
        adapter: (deadProtocols as any)[protocolName]
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
  exportName?: string;
}> {
  const protocols: any[] = [];

  const typesToCheck = adapterType
    ? { [adapterType]: factoriesByAdapterType[adapterType] }
    : factoriesByAdapterType;

  for (const [type, factories] of Object.entries(typesToCheck)) {
    if (!factories) continue;

    for (const factoryPath of factories) {
      try {
        const { importPath, factoryName, exportName } = resolveFactoryPath(factoryPath);
        const isHelper = factoryPath.startsWith('helpers/');
        const sourcePath = isHelper ? `helpers/${factoryName}.ts` : `factory/${factoryName}.ts`;

        // Dynamically import the factory
        const factoryModule = require(importPath);
        const factory = (exportName ? factoryModule[exportName] : factoryModule) as FactoryAdapter;

        if (!factory.protocolList) continue;

        factory.protocolList.forEach(protocolName => {
          protocols.push({
            protocolName,
            factoryName,
            adapterType: type,
            sourcePath,
            exportName,
          });
        });
      } catch (error) {
        // Skip if factory doesn't exist or has errors
        console.log(`Error loading factory ${factoryPath}:`, error);
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
