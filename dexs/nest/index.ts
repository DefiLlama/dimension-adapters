import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// API Configuration Constants
const API_CONFIG = {
  FENIX_BASE: 'https://api.nest.aegas.it',
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
  try {
    const url = `${blazeApiBase}/pools/aggregated-volume-sum?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`;
    const response = await httpGetWithRetry(url);
    
    if (validateResponse(response, ['Sum', 'sum'])) {
      const volume = parseUsdValue(response.Sum || response.sum);
      if (volume > 0) {
        return volume;
      }
    }
    
    console.warn('Blaze API returned invalid or zero volume');
    return 0;
  } catch (error) {
    console.warn(`Failed to fetch 24h volume from Blaze API: ${error instanceof Error ? error.message : String(error)}`);
    return 0;
  }
};

const fetch24hFees = async (
  blazeApiBase: string,
  fromDate: string,
  toDate: string
): Promise<number> => {
  try {
    const url = `${blazeApiBase}/pools/aggregated-fees-sum?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`;
    const response = await httpGetWithRetry(url);
    
    if (validateResponse(response, ['Sum', 'sum'])) {
      const fees = parseUsdValue(response.Sum || response.sum);
      if (fees > 0) {
        return fees;
      }
    }
    
    console.warn('Blaze API returned invalid or zero fees');
    return 0;
  } catch (error) {
    console.warn(`Failed to fetch 24h fees from Blaze API: ${error instanceof Error ? error.message : String(error)}`);
    return 0;
  }
};

const fetch24hMetricsFromV3Pools = async (
  fenixApiBase: string,
  oneDayAgoTimestamp: number,
  toTimestamp: number
): Promise<{ volume: number; fees: number }> => {
  try {
    const url = `${fenixApiBase}/graph/v3-pools?from=${oneDayAgoTimestamp}`;
    const response = await httpGetWithRetry(url);
    
    const pools = response?.data?.pools || response?.pools || [];
    let v3DailyVolume = 0;
    let v3DailyFees = 0;
    
    pools.forEach((pool: any) => {
      const poolDayData = pool.poolDayData || [];
      poolDayData.forEach((dayData: any) => {
        // Check if dayData is within the last 24 hours
        const dayTimestamp = dayData.date * 86400; // Convert day number to timestamp
        if (dayTimestamp >= oneDayAgoTimestamp && dayTimestamp <= toTimestamp) {
          v3DailyVolume += parseUsdValue(dayData.volumeUSD);
          v3DailyFees += parseUsdValue(dayData.feesUSD);
        }
      });
    });
    
    return { volume: v3DailyVolume, fees: v3DailyFees };
  } catch (error) {
    console.warn(`Failed to fetch V3 pools day data: ${error instanceof Error ? error.message : String(error)}`);
    return { volume: 0, fees: 0 };
  }
};

const chainConfig = {
  [CHAIN.HYPERLIQUID]: {
    start: '2025-11-12', 
    fenixApiBase: API_CONFIG.FENIX_BASE,
    blazeApiBase: API_CONFIG.BLAZE_BASE,
  },
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
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

  try {
    const [blazeVolume, blazeFees] = await Promise.all([
      fetch24hVolume(config.blazeApiBase, fromDate, toDate),
      fetch24hFees(config.blazeApiBase, fromDate, toDate),
    ]);

    let dailyVolume = blazeVolume;
    let dailyFees = blazeFees;

    if (dailyVolume === 0 || dailyFees === 0) {
      console.warn('Blaze API returned zero or invalid data, using fallback: Fetching 24h metrics from V3 pools day data');
      const v3Metrics = await fetch24hMetricsFromV3Pools(
        config.fenixApiBase,
        oneDayAgoTimestamp,
        options.toTimestamp
      );

      if (dailyVolume === 0) {
        dailyVolume = v3Metrics.volume;
      }

      if (dailyFees === 0) {
        dailyFees = v3Metrics.fees;
      } else {
        dailyFees = blazeFees;
      }
    }

    dailyVolume = Math.max(0, dailyVolume);
    dailyFees = Math.max(0, dailyFees);

    return {
      dailyVolume: dailyVolume.toString(),
      dailyFees: dailyFees.toString()
    };
  } catch (error) {
    console.error(`Error fetching Nest platform data: ${error instanceof Error ? error.message : String(error)}`);
    return {
      dailyVolume: "0",
      dailyFees: "0"
    };
  }
};

const methodology = {
  Volume: "Volume collected from all pools via Blaze API aggregated-volume-sum endpoint",
  Fees: "Platform fees collected from all pools via Blaze API aggregated-fees-sum endpoint"
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  methodology,
  adapter: chainConfig,
};

export default adapter;

