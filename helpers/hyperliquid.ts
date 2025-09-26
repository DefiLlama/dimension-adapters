import { queryAllium } from './allium';
import { FetchOptions } from '../adapters/types';
import * as fs from 'fs';
import * as path from 'path';
import axios from "axios";
import { decompressFrame } from 'lz4-napi';
import { getEnv } from './env';
import { httpGet } from '../utils/fetchURL';
import { formatAddress } from '../utils/utils';

export const fetchBuilderCodeRevenueAllium = async ({ options, builder_address }: { options: FetchOptions, builder_address: string }) => {
  // Delay as data is available only after 48 hours
  const startTimestamp = options.startOfDay;
  const endTimestamp = startTimestamp + 86400;
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();

  // Latest Update: The fills table refers to hyperliquid.raw.fills. In that table, everything is realtime. However, the hyperliquid.raw.builder_fills has historical back to 2024, the hyperliquid.raw.fills only has builder address since around 17th of july iirc.

  // const time_48_hours_ago = new Date().getTime() / 1000 - 48 * 60 * 60;
  // if (startTimestamp > time_48_hours_ago) {
  //   throw new Error(`Builder Fee Data is typically available with a 1-2 day delay.`);
  // }

  // Builder fees and trade volume are calculated from both hyperliquid.raw.builder_fills and hyperliquid.dex.trades
  // hyperliquid.raw.builder_fills is the source of truth for builder fee attribution with ~1-2 day delay
  // hyperliquid.dex.trades provides builder fee data but relies on matching with builder_transactions
  // Builder fee data from the most recent ~48 hours should be treated as an estimate
  // When running the adapter daily at UTC 00:00, we check if Allium has filled any builder_fills data
  // for the given timerange. If count is zero, we throw an error indicating data is not yet available.

  // WITH builder_fills_check AS (
  //   SELECT 
  //     COUNT(*) as fills_count
  //   FROM hyperliquid.raw.builder_fills
  //   WHERE timestamp >= TO_TIMESTAMP_NTZ('${startTimestamp}')
  //     AND timestamp <= TO_TIMESTAMP_NTZ('${endTimestamp}')
  // ),

  const query = `
    WITH builder_fees AS (
      SELECT 
        SUM(builder_fee) as total_builder_fees
      FROM hyperliquid.raw.fills
      WHERE timestamp >= TO_TIMESTAMP_NTZ('${startTimestamp}')
        AND timestamp <= TO_TIMESTAMP_NTZ('${endTimestamp}')
        AND builder_address = '${builder_address}'
    ),
    dex_volume AS (
      SELECT 
        SUM(usd_amount) as total_volume
      FROM hyperliquid.dex.trades
      WHERE timestamp >= TO_TIMESTAMP_NTZ('${startTimestamp}')
        AND timestamp <= TO_TIMESTAMP_NTZ('${endTimestamp}')
        AND builder = '${builder_address}'
    )
    SELECT 
      COALESCE(bf.total_builder_fees, 0) as total_fees,
      COALESCE(dv.total_volume, 0) as total_volume
    FROM builder_fees bf
    CROSS JOIN dex_volume dv
  `;

  const data = await queryAllium(query);
  // Check if Allium has filled any builder_fills data for the given timerange
  // const fillsCount = data[0]?.fills_count || 0;
  // if (fillsCount === 0) {
  //   throw new Error(`Allium has not filled any builder_fills data for the timerange ${startTimestamp} to ${endTimestamp}. Data is typically available with a 1-2 day delay.`);
  // }

  // Use the combined results
  const totalFees = data[0]?.total_fees || 0;
  const totalVolume = data[0]?.total_volume || 0;

  dailyFees.addCGToken('usd-coin', totalFees);
  dailyVolume.addCGToken('usd-coin', totalVolume);

  return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

/**
 * Fetches builder code revenue directly from HyperLiquid's LZ4 compressed CSV files
 * 
 * NOTE: This function requires the 'lz4-napi' dependency to be installed.
 * Run: npm install lz4-napi@^2.9.0
 * 
 * This uses the fastest LZ4 library for Node.js, powered by Rust and napi-rs.
 * 
 * @param options - FetchOptions containing startOfDay timestamp and other utilities
 * @param builder_address - The builder address to fetch data for
 * @returns Promise with dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue
 */
// hl indexer only supports data from this date
const FROM_TIME = 1758585600
export const fetchBuilderCodeRevenue = async ({ options, builder_address }: { options: FetchOptions, builder_address: string }) => {
  const startTimestamp = options.startOfDay;
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();

  // try with llama hl indexer
  const endpoint = getEnv('LLAMA_HL_INDEXER')
  if (startTimestamp >= FROM_TIME && endpoint) {
    const dateString = new Date(startTimestamp * 1000).toISOString().split('T')[0].replace('-', '').replace('-', '');
    const response = await httpGet(`${endpoint}/v1/data/hourly?date=${dateString}&builder=${formatAddress(builder_address)}`);
    for (const item of response.data) {
      dailyFees.addCGToken('usd-coin', item.feeByTokens.USDC || 0)
      dailyVolume.addCGToken('usd-coin', item.volumeUsd)
    }

    return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
  }

  const date = new Date(startTimestamp * 1000);
  const dateStr = date.getFullYear().toString() + 
                  (date.getMonth() + 1).toString().padStart(2, '0') + 
                  date.getDate().toString().padStart(2, '0');

  const url = `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/${builder_address}/${dateStr}.csv.lz4`;

  const tempDir = path.join(__dirname, 'temp');
  const lz4FilePath = path.join(tempDir, `${dateStr}.csv.lz4`);
  const csvFilePath = path.join(tempDir, `${dateStr}.csv`);

  try {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    let response;
    try {
      response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: 30000, // 30 second timeout
      });
    } catch (error: any) {
      if (error.response?.status === 403) {
        throw new Error(`Builder fee data is not available for ${dateStr}. Data may not exist for this date or may still be processing.`);
      }
      throw new Error(`Failed to download builder fee data: ${error.message}`);
    }

    const writer = fs.createWriteStream(lz4FilePath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });    
    const compressedData = fs.readFileSync(lz4FilePath);
    
    let decompressedBuffer: Buffer = await decompressFrame(compressedData);    
    const csvContent = decompressedBuffer.toString('utf8');
    
    const lines = csvContent.split('\n').filter(line => line.trim().length > 0);
    const headers = lines[0].split(',').map((h: string) => h.trim());
    const builderFeeIndex = headers.findIndex((h: string) => h === 'builder_fee');
    const pxIndex = headers.findIndex((h: string) => h === 'px');
    const szIndex = headers.findIndex((h: string) => h === 'sz');

    let totalBuilderFees = 0;
    let totalVolume = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line) {
        const values = line.split(',');
        
        if (values.length >= Math.max(builderFeeIndex, pxIndex, szIndex) + 1) {
          const builderFee = parseFloat(values[builderFeeIndex]) || 0;
          const px = parseFloat(values[pxIndex]) || 0;
          const sz = parseFloat(values[szIndex]) || 0;
          
          totalBuilderFees += builderFee;
          totalVolume += px * sz;
        }
      }
    }

    dailyFees.addCGToken('usd-coin', totalBuilderFees);
    dailyVolume.addCGToken('usd-coin', totalVolume);

    return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };

  } catch (error) {
    throw error;
  } finally {
    try {
      if (fs.existsSync(lz4FilePath)) {
        fs.unlinkSync(lz4FilePath);
      }
      if (fs.existsSync(csvFilePath)) {
        fs.unlinkSync(csvFilePath);
      }
    } catch (cleanupError) {
      // Silently ignore cleanup errors
    }
  }
};
