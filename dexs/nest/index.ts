import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const FEES_VAULT_FACTORY = '0x705C76e29977Ed52cd93d390A7BBcC61189724C0';
const GAUGE_RATE_PRECISION = 10_000;

// API Configuration Constants
const API_CONFIG = {
  BLAZE_BASE: 'https://blaze.nest.aegas.it',
  REQUEST_TIMEOUT_MS: 30000, 
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000, 
} as const;

const getGlobalFetch = () => {
  if (typeof globalThis !== 'undefined' && globalThis.fetch) {
    return globalThis.fetch;
  }
  if (typeof window !== 'undefined' && window.fetch) {
    return window.fetch;
  }
  return undefined;
};
const globalFetchFn = getGlobalFetch();

const httpGetWithRetry = async (url: string, retries: number = API_CONFIG.MAX_RETRIES): Promise<any> => {
  const fetchWithTimeout = async (url: string): Promise<Response> => {
    if (globalFetchFn) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.REQUEST_TIMEOUT_MS);
      
      try {
        const response = await globalFetchFn(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        return response;
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    }
    
    const https = require('https');
    const http = require('http');
    
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      const timeout = setTimeout(() => {
        reject(new Error(`Request timeout for ${url}`));
      }, API_CONFIG.REQUEST_TIMEOUT_MS);
      
      client.get(url, (res: any) => {
        clearTimeout(timeout);
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP error! status: ${res.statusCode} for URL: ${url}`));
          return;
        }
        let data = '';
        res.on('data', (chunk: any) => { data += chunk; });
        res.on('end', () => {
          resolve({
            ok: true,
            status: res.statusCode || 200,
            text: async () => data,
            json: async () => {
              if (!data || data.trim() === '') {
                return {};
              }
              try {
                return JSON.parse(data);
              } catch (e) {
                throw new Error(`Invalid JSON response from ${url}: ${e}`);
              }
            }
          } as Response);
        });
      }).on('error', (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  };

  try {
    const response = await fetchWithTimeout(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status} for URL: ${url}`);
    }
    
    const text = await response.text();
    if (!text || text.trim() === '') {
      return {};
    }
    
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`Invalid JSON response from ${url}: ${e}`);
    }
  } catch (error) {
    if (retries > 0) {
      const delay = API_CONFIG.RETRY_DELAY_MS * (API_CONFIG.MAX_RETRIES - retries + 1);
      console.warn(`Request failed for ${url}, retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return httpGetWithRetry(url, retries - 1);
    }
    throw error;
  }
};

const parseUsdValue = (value: any): number => {
  if (value === null || value === undefined || value === "" || value === "0" || value === 0) {
    return 0;
  }
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  }
  const num = Number(value);
  return isNaN(num) ? 0 : num;
};

const formatDateForApi = (timestamp: number): string => {
  return new Date(timestamp * 1000).toISOString();
};

const validateResponse = (response: any, expectedFields: string[]): boolean => {
  if (!response || typeof response !== 'object') {
    return false;
  }
  return expectedFields.some(field => field in response);
};

const fetch24hVolume = async (
  blazeApiBase: string,
  fromDate: string,
  toDate: string
): Promise<number> => {
  const url = `${blazeApiBase}/pools/aggregated-volume-sum?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`;
  const response = await httpGetWithRetry(url);
  
  if (validateResponse(response, ['Sum', 'sum'])) {
    return parseUsdValue(response.Sum || response.sum);
  }

  return 0;
};

const fetch24hFees = async (
  blazeApiBase: string,
  fromDate: string,
  toDate: string
): Promise<number> => {
  const url = `${blazeApiBase}/pools/aggregated-fees-sum?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`;
  const response = await httpGetWithRetry(url);

  if (validateResponse(response, ['Sum', 'sum'])) {
    return parseUsdValue(response.Sum || response.sum);
  }

  return 0;
};

const fetchLiquidityStats = async (
  blazeApiBase: string,
  fromDate: string,
  toDate: string
): Promise<{ volume: number; fees: number }> => {
  const url = `${blazeApiBase}/pools/liquidity-stats?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}&intervalSeconds=86400`;
  const response = await httpGetWithRetry(url);
  const sum = (pts: any[]) => (pts || []).reduce((acc: number, pt: any) => acc + parseUsdValue(pt.price), 0);
  return {
    volume: sum(response?.volume),
    fees: sum(response?.fees),
  };
};

const makeReturn = (options: FetchOptions, volume: number, fees: number, gaugeRate: number) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  dailyVolume.addUSDValue(Math.max(0, volume));
  dailyFees.addUSDValue(Math.max(0, fees), METRIC.SWAP_FEES);

  dailyRevenue.addUSDValue(Math.max(0, fees * (1 - gaugeRate)), 'Swap Fees to protocol');
  dailyRevenue.addUSDValue(Math.max(0, fees * gaugeRate), 'Swap Fees to veNest lockers');

  dailyProtocolRevenue.addUSDValue(Math.max(0, fees * (1 - gaugeRate)), 'Swap Fees to protocol');
  dailyHoldersRevenue.addUSDValue(Math.max(0, fees * gaugeRate)), 'Swap Fees to veNest lockers';

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue: 0,
    dailyHoldersRevenue,
  };
};

const chainConfig: any = {
  [CHAIN.HYPERLIQUID]: {
    start: '2025-11-12',
    blazeApiBase: API_CONFIG.BLAZE_BASE,
  },
};

const fetch = async (options: FetchOptions) => {
  if (!options || !options.chain) {
    throw new Error('Invalid options: chain is required');
  }

  const config = chainConfig[options.chain];
  if (!config) {
    throw new Error(`Chain ${options.chain} not supported`);
  }

  // Validate timestamps
  if (!options.toTimestamp || options.toTimestamp <= 0) {
    throw new Error('Invalid toTimestamp');
  }

  // Calculate date range for 24h metrics
  const oneDayAgoTimestamp = options.toTimestamp - 86400;
  const fromDate = formatDateForApi(oneDayAgoTimestamp);
  const toDate = formatDateForApi(options.toTimestamp);

  // Validate date range
  if (oneDayAgoTimestamp >= options.toTimestamp) {
    throw new Error('Invalid date range: from date must be before to date');
  }

  const gaugeConfig = await options.api.call({
    target: FEES_VAULT_FACTORY,
    abi: 'function defaultDistributionConfig() view returns (uint256 toGaugeRate, address[] recipients, uint256[] rates)',
  });
  const rawGaugeRate = gaugeConfig?.toGaugeRate ?? gaugeConfig?.[0];
  const gaugeRate = Number(rawGaugeRate) / GAUGE_RATE_PRECISION;
  if (!Number.isFinite(gaugeRate) || gaugeRate < 0 || gaugeRate > 1) {
    throw new Error('Invalid gauge rate');
  }

  try {
    const [blazeVolume, blazeFees] = await Promise.all([
      fetch24hVolume(config.blazeApiBase, fromDate, toDate),
      fetch24hFees(config.blazeApiBase, fromDate, toDate),
    ]);
    return makeReturn(options, blazeVolume, blazeFees, gaugeRate);
  } catch {
    console.warn(`Nest primary endpoints failed (${options.dateString}), trying liquidity-stats fallback`);
    try {
      const { volume, fees } = await fetchLiquidityStats(config.blazeApiBase, fromDate, toDate);
      return makeReturn(options, volume, fees, gaugeRate);
    } catch {
      throw new Error(`Error fetching Nest platform data for date ${options.dateString}`);
    }
  }
};

const methodology = {
  Volume: "Volume is collected from all pools via the Blaze API aggregated-volume-sum endpoint.",
  Fees: "Platform fees are collected from all pools via the Blaze API aggregated-fees-sum endpoint.",
  Revenue: "All swap fees accrue to the protocol (no LP share).",
  ProtocolRevenue: "Portion of swap fees going to the protocol treasury.",
  SupplySideRevenue: "LPs do not earn fees; instead, they are compensated with NEST tokens.",
  HoldersRevenue: "Part of swap fees go to veNest lockers (based on the gauge rate - currently 100 % of the swap fees)."
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Swap fees collected from all pools.",
  },
  Revenue: {
    'Swap Fees to protocol': "Portion of swap fees going to the protocol treasury.",
    'Swap Fees to veNest lockers': "Portion of swap fees going to the veNest lockers.",
  },
  ProtocolRevenue: {
    'Swap Fees to protocol': "Portion of swap fees going to the protocol treasury.",
  },
  HoldersRevenue: {
    'Swap Fees to veNest lockers': "Portion of swap fees going to the veNest lockers.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  methodology,
  breakdownMethodology,
  adapter: chainConfig,
};

export default adapter;
