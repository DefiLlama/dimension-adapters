// @ts-ignore
const { getConfig } = require('../helper/cache');

// Pacifica API Endpoints (confirmed)
const PACIFICA_PRICES_API = 'https://api.pacifica.fi/api/v1/info/prices';

// TypeScript interfaces for volume-related API responses
interface PacificaPriceData {
  funding: string;
  mark: string;
  mid: string;
  next_funding: string;
  open_interest: string;
  oracle: string;
  symbol: string;
  timestamp: number;
  volume_24h: string;
  yesterday_price: string;
}

interface PacificaPricesApiResponse {
  success: boolean;
  data: PacificaPriceData[];
  error: string | null;
  code: string | null;
}

interface ApiContext {
  chain: string;
  chainId: number;
}


async function fetchVolumeData(): Promise<PacificaPriceData[]> {
  try {
    const response: PacificaPricesApiResponse = await getConfig('pacifica/volume-data', PACIFICA_PRICES_API);
    return response.data || [];
  } catch (error) {
    console.error('Error fetching Pacifica volume data:', error);
    return [];
  }
}

// @ts-ignore
module.exports = {
  async calculateVolume(api: ApiContext): Promise<number> {
    const volumeData = await fetchVolumeData();
    // Calculate total volume across all trading pairs using volume_24h from API
    const totalVolume = volumeData.reduce((sum: number, pair: PacificaPriceData) => {
      return sum + (parseFloat(pair.volume_24h) || 0);
    }, 0);
    return totalVolume;
  },
  fetchVolumeData
};
