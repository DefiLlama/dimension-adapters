import { queryAllium } from "./allium";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import { decompressFrame } from "lz4-napi";
import { getEnv } from "./env";
import { httpGet, httpPost } from "../utils/fetchURL";
import { formatAddress, sleep } from "../utils/utils";
import { Balances } from "@defillama/sdk";
import { findClosest } from "./utils/findClosest";
import { CHAIN } from "./chains";

export const fetchBuilderCodeRevenueAllium = async ({
  options,
  builder_address,
}: {
  options: FetchOptions;
  builder_address: string;
}) => {
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

  dailyFees.addCGToken("usd-coin", totalFees);
  dailyVolume.addCGToken("usd-coin", totalVolume);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
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
export const LLAMA_HL_INDEXER_FROM_TIME = 1754006400;
export const fetchBuilderCodeRevenue = async ({
  options,
  builder_address,
}: {
  options: FetchOptions;
  builder_address: string;
}) => {
  const startTimestamp = options.startOfDay;
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();

  // try with llama hl indexer
  const endpoint = getEnv("LLAMA_HL_INDEXER");
  if (startTimestamp >= LLAMA_HL_INDEXER_FROM_TIME && endpoint) {
    const dateString = new Date(startTimestamp * 1000)
      .toISOString()
      .split("T")[0]
      .replace("-", "")
      .replace("-", "");
    const response = await httpGet(
      `${endpoint}/v1/data/hourly?date=${dateString}&builder=${formatAddress(builder_address)}`,
    );
    for (const item of response.data) {
      dailyFees.addCGToken("usd-coin", item.feeByTokens.USDC || 0);
      dailyFees.addCGToken("ethena-usde", item.feeByTokens.USDE || 0);
      dailyFees.addCGToken("usdh-2", item.feeByTokens.USDH || 0);
      dailyVolume.addCGToken("usd-coin", item.volumeUsd);
    }

    return {
      dailyVolume,
      dailyFees,
      dailyRevenue: dailyFees,
      dailyProtocolRevenue: dailyFees,
    };
  }

  const date = new Date(startTimestamp * 1000);
  const dateStr =
    date.getFullYear().toString() +
    (date.getMonth() + 1).toString().padStart(2, "0") +
    date.getDate().toString().padStart(2, "0");

  const url = `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/${builder_address}/${dateStr}.csv.lz4`;

  const tempDir = path.join(__dirname, "temp");
  const lz4FilePath = path.join(tempDir, `${dateStr}.csv.lz4`);
  const csvFilePath = path.join(tempDir, `${dateStr}.csv`);

  try {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    let response;
    try {
      response = await axios({
        method: "GET",
        url: url,
        responseType: "stream",
        timeout: 30000, // 30 second timeout
      });
    } catch (error: any) {
      if (error.response?.status === 403) {
        throw new Error(
          `Builder fee data is not available for ${dateStr}. Data may not exist for this date or may still be processing.`,
        );
      }
      throw new Error(`Failed to download builder fee data: ${error.message}`);
    }

    const writer = fs.createWriteStream(lz4FilePath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });
    const compressedData = fs.readFileSync(lz4FilePath);

    let decompressedBuffer: Buffer = await decompressFrame(compressedData);
    const csvContent = decompressedBuffer.toString("utf8");

    const lines = csvContent
      .split("\n")
      .filter((line) => line.trim().length > 0);
    const headers = lines[0].split(",").map((h: string) => h.trim());
    const builderFeeIndex = headers.findIndex(
      (h: string) => h === "builder_fee",
    );
    const pxIndex = headers.findIndex((h: string) => h === "px");
    const szIndex = headers.findIndex((h: string) => h === "sz");

    let totalBuilderFees = 0;
    let totalVolume = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line) {
        const values = line.split(",");

        if (values.length >= Math.max(builderFeeIndex, pxIndex, szIndex) + 1) {
          const builderFee = parseFloat(values[builderFeeIndex]) || 0;
          const px = parseFloat(values[pxIndex]) || 0;
          const sz = parseFloat(values[szIndex]) || 0;

          totalBuilderFees += builderFee;
          totalVolume += px * sz;
        }
      }
    }

    dailyFees.addCGToken("usd-coin", totalBuilderFees);
    dailyVolume.addCGToken("usd-coin", totalVolume);

    return {
      dailyVolume,
      dailyFees,
      dailyRevenue: dailyFees,
      dailyProtocolRevenue: dailyFees,
    };
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

// confirm from hyperliquid team
// before 30 Aug, 97% of fees go to Assistance Fund for burning tokens, remaining 3% go to HLP Vault
// after 30 Aug, 99% of fees go to Assistance Fund for burning tokens, remaining 1% go to HLP Vault
export function getRevenueRatioShares(timestamp: number): {
  holdersShare: number;
  hlpShare: number;
} {
  if (timestamp > 1756512000) {
    return {
      holdersShare: 0.99,
      hlpShare: 0.01,
    };
  } else {
    return {
      holdersShare: 0.97,
      hlpShare: 0.03,
    };
  }
}

// need a better way to do on this coin mapping
export const CoinGeckoMaps: Record<string, string> = {
  USDC: "usd-coin",
  HYPE: "hyperliquid",
  USDT0: "usdt0",
  XAUT0: "tether-gold-tokens",
  USDE: "ethena-usde",
  UBTC: "unit-bitcoin",
  UETH: "unit-ethereum",
  USOL: "unit-solana",
  UPUMP: "unit-pump",
  UBONK: "bonk",
  UFART: "unit-fartcoin",
  UUUSPX: "spx6900",
  UXPL: "plasma",
  UENA: "ethena",
  UWLD: "worldcoin-wld",
  UDOGE: "dogecoin",
  UDZ: "doublezero",
  USPYX: "sp500-xstock",
  UMOG: "mog-coin",
  USDH: "usdh-2",
};

export async function getUnitSeployedCoins(): Promise<Record<string, string>> {
  const coins: Record<string, string> = {};

  const response = await httpPost("https://api-ui.hyperliquid.xyz/info", {
    type: "spotMeta",
  });
  const names = response.tokens
    .filter((item: any) => String(item.fullName).startsWith("Unit "))
    .map((item: any) => item.name);
  for (const name of names) {
    coins[name] = CoinGeckoMaps[name];
  }

  return coins;
}

interface Hip3DeployerMetrics {
  dailyPerpVolume: Balances;
  dailyPerpFee: Balances;
  currentPerpOpenInterest?: number;
}

interface QueryIndexerResult {
  dailyPerpVolume: Balances;
  dailySpotVolume: Balances;

  // perp fees = perp revenue + builders revenue
  dailyPerpRevenue: Balances;
  dailyBuildersRevenue: Balances;

  // spot fees = sport revenue + unit revenue
  dailySpotRevenue: Balances;
  dailyUnitRevenue: Balances;

  currentPerpOpenInterest?: number;

  hip3Deployers: Record<string, Hip3DeployerMetrics>;
}

export async function queryHyperliquidIndexer(
  options: FetchOptions,
): Promise<QueryIndexerResult> {
  if (options.startOfDay < LLAMA_HL_INDEXER_FROM_TIME) {
    throw Error("request data too old, unsupported by LLAMA_HL_INDEXER");
  }

  const endpoint = getEnv("LLAMA_HL_INDEXER");
  if (!endpoint) {
    throw Error("missing LLAMA_HL_INDEXER env");
  }

  // 20250925
  const dateString = new Date(options.startOfDay * 1000)
    .toISOString()
    .split("T")[0]
    .replace("-", "")
    .replace("-", "");
  const response = await httpGet(
    `${endpoint}/v1/data/hourly?date=${dateString}`,
  );

  const coinsDeployedByUnit = await getUnitSeployedCoins();

  const dailyPerpVolume = options.createBalances();
  const dailySpotVolume = options.createBalances();
  const dailyPerpRevenue = options.createBalances();
  const dailySpotRevenue = options.createBalances();
  const dailyBuildersRevenue = options.createBalances();
  const dailyUnitRevenue = options.createBalances();
  const hip3Deployers: Record<string, Hip3DeployerMetrics> = {};

  let currentPerpOpenInterest: number | undefined = undefined;

  const houyItems = response.data.sort(function (a: any, b: any) {
    return a.timestamp > b.timestamp ? 1 : -1;
  });

  for (const item of houyItems) {
    dailyPerpVolume.addCGToken("usd-coin", item.perpsVolumeUsd);
    dailySpotVolume.addCGToken("usd-coin", item.spotVolumeUsd);

    // add fees from perps trading
    dailyPerpRevenue.addCGToken("usd-coin", item.perpsFeeByTokens.USDC);

    // add builder fees
    for (const builder of Object.values(item.builders)) {
      dailyBuildersRevenue.addCGToken(
        "usd-coin",
        Number((builder as any).feeByTokens.USDC || 0),
      );
    }

    // add fees from spot trading
    for (const [coin, fees] of Object.entries(item.spotFeeByTokens)) {
      // add unit evneue
      if (coinsDeployedByUnit[coin]) {
        dailyUnitRevenue.addCGToken(coinsDeployedByUnit[coin], fees);
      } else if (CoinGeckoMaps[coin]) {
        dailySpotRevenue.addCGToken(CoinGeckoMaps[coin], fees);
      }
    }

    currentPerpOpenInterest = item.perpsOpenInterestUsd
      ? Number(item.perpsOpenInterestUsd)
      : undefined;

    // add HIP3 deployers data
    if (item.hip3Deployers) {
      for (const [deployer, metrics] of Object.entries(item.hip3Deployers)) {
        if (!hip3Deployers[deployer]) {
          hip3Deployers[deployer] = {
            dailyPerpVolume: options.createBalances(),
            dailyPerpFee: options.createBalances(),
          };
        }

        if ((metrics as any).perpsVolumeUsdSiteA) {
          hip3Deployers[deployer].dailyPerpVolume.addCGToken(
            "usd-coin",
            Number((metrics as any).perpsVolumeUsdSiteA),
          );
        } else {
          hip3Deployers[deployer].dailyPerpVolume.addCGToken(
            "usd-coin",
            Number((metrics as any).perpsVolumeUsd) / 2,
          );
        }

        for (const [coin, amount] of Object.entries(
          (metrics as any).perpsFeeTokens,
        )) {
          if (CoinGeckoMaps[coin]) {
            hip3Deployers[deployer].dailyPerpFee.addCGToken(
              CoinGeckoMaps[coin],
              amount,
            );
          }
        }

        if ((metrics as any).perpsOpenInterestUsd) {
          hip3Deployers[deployer].currentPerpOpenInterest = Number(
            (metrics as any).perpsOpenInterestUsd,
          );
        }
      }
    }
  }

  return {
    dailyPerpVolume,
    dailySpotVolume,
    dailyPerpRevenue,
    dailySpotRevenue,
    dailyBuildersRevenue,
    dailyUnitRevenue,
    currentPerpOpenInterest,
    hip3Deployers,
  };
}

interface QueryHypurrscanApiResult {
  dailyPerpFees: Balances;
  dailySpotFees: Balances;
}

const HYPURRSCAN_API = "https://api.hypurrscan.io/fees";
export async function queryHypurrscanApi(
  options: FetchOptions,
): Promise<QueryHypurrscanApiResult> {
  const result: QueryHypurrscanApiResult = {
    dailyPerpFees: options.createBalances(),
    dailySpotFees: options.createBalances(),
  };

  const feesItems = (await httpGet(HYPURRSCAN_API)).map((item: any) => {
    return {
      ...item,
      time: Number(item.time) * 1000,
    };
  });

  const startCumFees: any = findClosest(
    options.startTimestamp,
    feesItems,
    3600,
  );
  const endCumFees: any = findClosest(options.endTimestamp, feesItems, 3600);

  const totalFees =
    (Number(endCumFees.total_fees) - Number(startCumFees.total_fees)) / 1e6;
  const spotFees =
    (Number(endCumFees.total_spot_fees) -
      Number(startCumFees.total_spot_fees)) /
    1e6;

  result.dailyPerpFees.addUSDValue(totalFees - spotFees);
  result.dailySpotFees.addUSDValue(spotFees);

  return result;
}

export const fetchHIP3DeployerData = async ({
  options,
  hip3DeployerId,
}: {
  options: FetchOptions;
  hip3DeployerId: string;
}): Promise<Hip3DeployerMetrics> => {
  const result = await queryHyperliquidIndexer(options);
  if (result.hip3Deployers[hip3DeployerId]) {
    if (!result.hip3Deployers[hip3DeployerId].currentPerpOpenInterest) {
      await sleep(1);
      result.hip3Deployers[hip3DeployerId].currentPerpOpenInterest = 0;
      const response = await httpPost("https://api.hyperliquid.xyz/info", {
        type: "metaAndAssetCtxs",
        dex: hip3DeployerId,
      });
      for (const item of response[1]) {
        const oi = parseFloat(item.openInterest || "0");
        const markPrice = parseFloat(item.markPx || "0");
        result.hip3Deployers[hip3DeployerId].currentPerpOpenInterest +=
          oi * markPrice;
      }
    }

    return result.hip3Deployers[hip3DeployerId];
  }

  return {
    dailyPerpVolume: options.createBalances(),
    dailyPerpFee: options.createBalances(),
    currentPerpOpenInterest: 0,
  };
};

export const exportHIP3DeployerAdapter = (
  dexId: string,
  props: { type: "dexs" | "oi"; start?: string; methodology?: any },
) => {
  const adapter: SimpleAdapter = {
    version: 1,
    doublecounted: true, // all metrics are double-counted to hyperliquid
    adapter: {
      [CHAIN.HYPERLIQUID]: {
        fetch: async function (_1: number, _: any, options: FetchOptions) {
          const result = await fetchHIP3DeployerData({
            options,
            hip3DeployerId: dexId,
          });

          if (props.type === "dexs") {
            return {
              dailyVolume: result.dailyPerpVolume,
              dailyFees: result.dailyPerpFee,
              dailyRevenue: result.dailyPerpFee.clone(0.5),
              dailyProtocolRevenue: result.dailyPerpFee.clone(0.5),
            };
          } else {
            return {
              openInterestAtEnd: result.currentPerpOpenInterest,
            };
          }
        },
        start: props.type === "dexs" ? props.start : undefined,
        runAtCurrTime: props.type === "oi",
      },
    },
    methodology: props.methodology,
  };

  return adapter;
};

export const exportBuilderAdapter = (
  builderAddresses: Array<string>,
  props: { start?: string; methodology?: any },
) => {
  const adapter: SimpleAdapter = {
    version: 1,
    doublecounted: true, // all metrics are double-counted to hyperliquid
    adapter: {
      [CHAIN.HYPERLIQUID]: {
        fetch: async function (_1: number, _: any, options: FetchOptions) {
          const dailyVolume = options.createBalances();
          const dailyFees = options.createBalances();
          const dailyRevenue = options.createBalances();
          const dailyProtocolRevenue = options.createBalances();

          for (const address of builderAddresses) {
            const result = await fetchBuilderCodeRevenue({
              options,
              builder_address: address,
            });
            dailyVolume.addBalances(result.dailyVolume);
            dailyFees.addBalances(result.dailyFees);
            dailyRevenue.addBalances(result.dailyRevenue);
            dailyProtocolRevenue.addBalances(result.dailyProtocolRevenue);
          }

          return {
            dailyVolume,
            dailyFees,
            dailyRevenue,
            dailyProtocolRevenue,
          };
        },
        start: props.start ? props.start : "2025-08-01",
      },
    },
    methodology: props.methodology
      ? props.methodology
      : {
          Volume:
            " Total volume from users were settled to Hyperliquid Perps Trades.",
          Fees: "Builder code revenue from Hyperliquid Perps Trades.",
          Revenue: "Builder code revenue from Hyperliquid Perps Trades.",
          ProtocolRevenue:
            "Builder code revenue from Hyperliquid Perps Trades.",
        },
  };

  return adapter;
};
