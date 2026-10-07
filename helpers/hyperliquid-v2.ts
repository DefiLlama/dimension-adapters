import { Balances } from "@defillama/sdk";
import axios from "axios";
import { decompressFrame } from "lz4-napi";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { httpGet } from "../utils/fetchURL";
import { CHAIN } from "./chains";
import { getEnv } from "./env";
import { BuilderAddressConfig, CoinGeckoMaps, getUnitDeployedCoins, LLAMA_HL_INDEXER_FROM_TIME } from "./hyperliquid";

// Daily summaries from the /v2 routes of the DefiLlama Hyperliquid indexer, documented at
// https://hl-indexer.llama.rip/llms.txt. The indexer sums the 24 hourly rows of a UTC day itself,
// replacing the client-side summing of /v1/data/hourly in queryHyperliquidIndexer.

type TokenMap = Record<string, number>;

interface FeesDailyResponse {
  hours: number;
  perpsFees: TokenMap;
  spotFees: TokenMap;
  outcomeFees: TokenMap;
  perpsDeployersFeesUsd: number;
  aqav2YieldUsd: number;
  afBuyBackHypeUsd: number;
  perpsMakerRebates: TokenMap;
  spotMakerRebates: TokenMap;
  perpsBuildersFees: TokenMap;
  spotBuildersFees: TokenMap;
  outcomeBuildersFees: TokenMap;
}

interface VolumeDailyResponse {
  hours: number;
  perpsVolumeUsd: number;
  spotVolumeUsd: number;
  outcomeVolumeUsd: number;
  outcomeNotionalVolumeUsd: number;
  liquidationVolumeUsd: number;
}

export interface QueryHyperliquidIndexerV2Result {
  dailyPerpVolume: Balances;
  dailySpotVolume: Balances;
  dailyOutcomeVolume: Balances;
  dailyOutcomeNotionalVolume: Balances; // shares at $1 face value, not part of any volume total
  dailyLiquidationVolume: Balances;

  // perp fees users paid, builder and deployer fees included, maker rebates excluded
  dailyPerpFees: Balances;
  // HIP-3 deployer fees, every fee token counted as $1. The per-token map (perpsDeployersFees) is empty
  // on days aggregated before it existed (44 days from 2026-03-21 on), the USD total is always there
  dailyPerpDeployersFees: Balances;

  // spot fees users paid (builder fees included, maker rebates excluded), split by fee token: tokens deployed
  // by Unit go to Unit, the rest is Hyperliquid's
  dailySpotFees: Balances;
  dailyUnitFees: Balances;

  // outcome fees users paid, builder fees included (outcome trading has no maker rebates)
  dailyOutcomeFees: Balances;

  // builder-code fees and maker rebates per market type. Each market's fees include only its own builder fees
  // and exclude its own rebates, so they are netted per market, never summed across markets.
  // Spot builder fees are split by fee token like the spot fees: dailySpot* for Hyperliquid's tokens, dailyUnit*
  // for Unit's. Spot maker rebates are all paid by Hyperliquid, whatever token they are paid in
  dailyPerpBuildersFees: Balances;
  dailySpotBuildersFees: Balances;
  dailyUnitBuildersFees: Balances;
  dailyOutcomeBuildersFees: Balances;
  dailyPerpMakerRebates: Balances;
  dailySpotMakerRebates: Balances;

  // perp fees kept by Hyperliquid: perp fees - perp builder fees - HIP-3 deployer fees - perp maker rebates
  dailyHyperliquidRevenue: Balances;
  // spot fees kept by Hyperliquid: dailySpotFees - dailySpotBuildersFees - dailySpotMakerRebates
  dailySpotHyperliquidRevenue: Balances;

  // AQAv2 reserve yield accrued that day, summed over the tracked stablecoins, 0 before 2026-08-27
  dailyAqav2Yield: Balances;
  // USD the Assistance Fund spent buying HYPE that day
  dailyAssistanceFundBuyBack: Balances;
}

const responses: Record<string, Promise<any>> = {};

// perps, spot and HLP adapters read the same day in one run, so each route is requested once per day
function requestDaily<T extends { hours: number }>(route: string, options: FetchOptions): Promise<T> {
  if (options.startOfDay < LLAMA_HL_INDEXER_FROM_TIME) throw Error("request data too old, unsupported by LLAMA_HL_INDEXER");

  const endpoint = getEnv("LLAMA_HL_INDEXER");
  if (!endpoint) throw Error("missing LLAMA_HL_INDEXER env");

  const url = `${endpoint}/v2/data/${route}/daily/${options.startOfDay}`;
  if (!responses[url]) {
    responses[url] = httpGet(url).then((response: T) => {
      // a day is summed from whatever hourly rows exist, so a partial day would be stored as a full one
      if (response.hours !== 24) throw Error(`hl indexer ${route}: only ${response.hours} of 24 hours aggregated for ${options.dateString}`);
      return response;
    }).catch((error) => {
      delete responses[url];
      throw error;
    });
  }
  return responses[url];
}

function addTokenMap(balances: Balances, tokenMap: TokenMap = {}, include: (token: string) => boolean = () => true) {
  for (const [token, amount] of Object.entries(tokenMap)) {
    if (CoinGeckoMaps[token] && include(token)) balances.addCGToken(CoinGeckoMaps[token], Number(amount || 0));
  }
}

export async function queryHyperliquidIndexerV2(options: FetchOptions): Promise<QueryHyperliquidIndexerV2Result> {
  const fees = await requestDaily<FeesDailyResponse>("fees", options);
  const volume = await requestDaily<VolumeDailyResponse>("volume", options);
  const coinsDeployedByUnit = await getUnitDeployedCoins();

  const usd = (value: number) => {
    const balances = options.createBalances();
    balances.addUSDValue(Number(value || 0));
    return balances;
  };
  const tokens = (tokenMap: TokenMap, include?: (token: string) => boolean) => {
    const balances = options.createBalances();
    addTokenMap(balances, tokenMap, include);
    return balances;
  };

  // spot token maps: tokens deployed by Unit priced through Unit's map, the rest through CoinGeckoMaps
  const unitTokens = (tokenMap: TokenMap = {}) => {
    const balances = options.createBalances();
    for (const [token, amount] of Object.entries(tokenMap)) {
      if (coinsDeployedByUnit[token]) balances.addCGToken(coinsDeployedByUnit[token], Number(amount || 0));
    }
    return balances;
  };
  const hyperliquidTokens = (tokenMap: TokenMap) => tokens(tokenMap, (token) => !coinsDeployedByUnit[token]);

  const dailyPerpFees = tokens(fees.perpsFees);
  const dailyPerpDeployersFees = usd(fees.perpsDeployersFeesUsd);
  const dailyPerpBuildersFees = tokens(fees.perpsBuildersFees);
  const dailyPerpMakerRebates = tokens(fees.perpsMakerRebates);

  const dailySpotFees = hyperliquidTokens(fees.spotFees);
  const dailyUnitFees = unitTokens(fees.spotFees);
  const dailySpotBuildersFees = hyperliquidTokens(fees.spotBuildersFees);
  const dailyUnitBuildersFees = unitTokens(fees.spotBuildersFees);
  // rebates paid in Unit tokens are paid by Hyperliquid too, so they are not netted against Unit's fees
  const dailySpotMakerRebates = hyperliquidTokens(fees.spotMakerRebates);
  dailySpotMakerRebates.add(unitTokens(fees.spotMakerRebates));

  const dailyHyperliquidRevenue = usd(
    await dailyPerpFees.getUSDValue()
    - await dailyPerpBuildersFees.getUSDValue()
    - await dailyPerpDeployersFees.getUSDValue()
    - await dailyPerpMakerRebates.getUSDValue()
  );
  const dailySpotHyperliquidRevenue = usd(
    await dailySpotFees.getUSDValue()
    - await dailySpotBuildersFees.getUSDValue()
    - await dailySpotMakerRebates.getUSDValue()
  );

  return {
    dailyPerpVolume: usd(volume.perpsVolumeUsd),
    dailySpotVolume: usd(volume.spotVolumeUsd),
    dailyOutcomeVolume: usd(volume.outcomeVolumeUsd),
    dailyOutcomeNotionalVolume: usd(volume.outcomeNotionalVolumeUsd),
    dailyLiquidationVolume: usd(volume.liquidationVolumeUsd),
    dailyPerpFees,
    dailyPerpDeployersFees,
    dailySpotFees,
    dailyUnitFees,
    dailyOutcomeFees: tokens(fees.outcomeFees),
    dailyPerpBuildersFees,
    dailySpotBuildersFees,
    dailyUnitBuildersFees,
    dailyOutcomeBuildersFees: tokens(fees.outcomeBuildersFees),
    dailyPerpMakerRebates,
    dailySpotMakerRebates,
    dailyHyperliquidRevenue,
    dailySpotHyperliquidRevenue,
    dailyAqav2Yield: usd(fees.aqav2YieldUsd),
    dailyAssistanceFundBuyBack: usd(fees.afBuyBackHypeUsd),
  };
}

// HIP-4 outcome markets went live on mainnet on 2026-05-02
export const HYPERLIQUID_HIP4_LAUNCH_TIME = 1777680000;

interface OutcomeOpenInterestDailyResponse {
  openInterest: number;
  firstHour: number;
  complete: boolean;
}

// Outstanding HIP-4 Yes/No pairs at the end of the day, each backed by $1 of collateral and counted once.
// The indexer builds it as a running total of hourly deltas, so it is only right when the day is fully
// aggregated and the hourly rows start no later than the HIP-4 launch.
export async function queryHyperliquidOutcomeOpenInterestV2(options: FetchOptions): Promise<number> {
  const endpoint = getEnv("LLAMA_HL_INDEXER");
  if (!endpoint) throw Error("missing LLAMA_HL_INDEXER env");

  const response: OutcomeOpenInterestDailyResponse = await httpGet(`${endpoint}/v2/data/openInterest/outcome/daily/${options.startOfDay}`);
  if (!response.complete) throw Error(`hl indexer outcome open interest: ${options.dateString} is not fully aggregated`);
  if (response.firstHour > HYPERLIQUID_HIP4_LAUNCH_TIME) throw Error(`hl indexer outcome open interest: hourly rows start after the HIP-4 launch, the running total is incomplete`);

  return Number(response.openInterest);
}

export type HyperliquidBuilderMarketV2 = "all" | "perps" | "spot" | "outcome";

interface BuilderDailyResponse {
  hours: number;
  builderFees: TokenMap;
  builderPerpsFees: TokenMap;
  builderSpotFees: TokenMap;
  builderOutcomeFees: TokenMap;
  builderVolumeUsd: number;
  builderPerpsVolumeUsd: number;
  builderSpotVolumeUsd: number;
  builderOutcomeVolumeUsd: number;
  builderOutcomeNotionalVolumeUsd: number;
}

const BUILDER_MARKET_FIELDS: Record<HyperliquidBuilderMarketV2, { volume: (d: BuilderDailyResponse) => number; fees: (d: BuilderDailyResponse) => TokenMap; name: string }> = {
  all: { volume: (d) => d.builderVolumeUsd, fees: (d) => d.builderFees, name: "perps, spot and outcome" },
  perps: { volume: (d) => d.builderPerpsVolumeUsd, fees: (d) => d.builderPerpsFees, name: "perps" },
  spot: { volume: (d) => d.builderSpotVolumeUsd, fees: (d) => d.builderSpotFees, name: "spot" },
  outcome: { volume: (d) => d.builderOutcomeVolumeUsd, fees: (d) => d.builderOutcomeFees, name: "HIP-4 outcome" },
};

// Hyperliquid publishes one fill file per builder and day, listing every fill that carried the builder code.
// Coins are "@<index>" or "PURR/USDC" for spot, "#<n>" for HIP-4 outcomes, and anything else for perps,
// "<dex>:<coin>" being a HIP-3 perp. A day with no fills has no file and is an error, as in fetchBuilderCodeRevenue.
async function fetchBuilderFillsFile(address: string, options: FetchOptions, market: HyperliquidBuilderMarketV2): Promise<{ volume: number; fees: number }> {
  const dateStr = options.dateString.replace(/-/g, "");
  let response;
  try {
    response = await axios({ method: "GET", url: `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/${address}/${dateStr}.csv.lz4`, responseType: "arraybuffer", timeout: 30000 });
  } catch (error: any) {
    if (error.response?.status === 403) throw new Error(`Builder fee data is not available for ${dateStr}. Data may not exist for this date or may still be processing.`);
    throw new Error(`Failed to download builder fee data: ${error.message}`);
  }

  const lines = (await decompressFrame(Buffer.from(response.data))).toString("utf8").split("\n").filter((line) => line.trim().length > 0);
  const headers = lines[0].split(",").map((h) => h.trim());
  const [coinIndex, pxIndex, szIndex, feeIndex] = ["coin", "px", "sz", "builder_fee"].map((h) => headers.indexOf(h));
  if ([coinIndex, pxIndex, szIndex, feeIndex].includes(-1)) throw new Error(`unexpected builder fill file columns: ${headers.join(",")}`);

  const marketOf = (coin: string): HyperliquidBuilderMarketV2 => /^#\d+$/.test(coin) ? "outcome" : (coin.startsWith("@") || coin.includes("/")) ? "spot" : "perps";
  let volume = 0;
  let fees = 0;
  for (const line of lines.slice(1)) {
    const values = line.split(",");
    if (market !== "all" && marketOf(values[coinIndex].trim()) !== market) continue;
    volume += (parseFloat(values[pxIndex]) || 0) * (parseFloat(values[szIndex]) || 0);
    fees += parseFloat(values[feeIndex]) || 0;
  }
  return { volume, fees };
}

// an address is either always active, or active between optional start and end days (inclusive)
function activeBuilderAddresses(builderAddresses: BuilderAddressConfig[], dateString: string): Set<string> {
  const active = new Set<string>();
  for (const entry of builderAddresses) {
    if (typeof entry === "string") active.add(entry.toLowerCase());
    else if ((!entry.start || dateString >= entry.start) && (!entry.end || dateString <= entry.end)) active.add(entry.address.toLowerCase());
  }
  // a set, so an address listed twice is not counted twice
  return active;
}

// Builder-code volume and fees summed over a list of builder addresses. Volume counts every fill carrying the
// builder code, as Hyperliquid tags it. An address with no activity that day returns zeros rather than an error.
// The indexer starts on 2025-08-01; earlier days are read from Hyperliquid's own builder fill files.
export async function fetchBuilderCodeDataV2({ options, builderAddresses, market = "all" }: {
  options: FetchOptions;
  builderAddresses: BuilderAddressConfig[];
  market?: HyperliquidBuilderMarketV2;
}): Promise<{ dailyVolume: Balances; dailyFees: Balances; dailyNotionalVolume?: Balances }> {
  const fields = BUILDER_MARKET_FIELDS[market];
  const addresses = activeBuilderAddresses(builderAddresses, options.dateString);
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  // outcome shares at $1 face value, not part of the outcome volume
  const dailyNotionalVolume = options.createBalances();

  if (options.startOfDay < LLAMA_HL_INDEXER_FROM_TIME) {
    for (const address of addresses) {
      const { volume, fees } = await fetchBuilderFillsFile(address, options, market);
      // priced as USDC, as fetchBuilderCodeRevenue does for these days
      dailyVolume.addCGToken("usd-coin", volume);
      dailyFees.addCGToken("usd-coin", fees);
    }
    return { dailyVolume, dailyFees };
  }

  for (const address of addresses) {
    const data = await requestDaily<BuilderDailyResponse>(`builder/${address}`, options);
    dailyVolume.addUSDValue(Number(fields.volume(data) || 0));
    addTokenMap(dailyFees, fields.fees(data));
    if (market === "outcome") dailyNotionalVolume.addUSDValue(Number(data.builderOutcomeNotionalVolumeUsd || 0));
  }

  return market === "outcome" ? { dailyVolume, dailyFees, dailyNotionalVolume } : { dailyVolume, dailyFees };
}

// Adapter for a protocol whose Hyperliquid builder codes are listed in builderAddresses. Builder-code fees are
// all kept by the builder.
export function exportBuilderAdapterV2(
  builderAddresses: BuilderAddressConfig[],
  props: { start?: string; deadFrom?: string; methodology?: any; market?: HyperliquidBuilderMarketV2; breakdownFees?: boolean; extraReturnFields?: Record<string, any> } = {},
): SimpleAdapter {
  const market = props.market ?? "all";
  const { name } = BUILDER_MARKET_FIELDS[market];
  const label = props.breakdownFees ? "Hyperliquid Builder Code Fees" : undefined;

  const adapter: SimpleAdapter = {
    version: 1, // the indexer serves daily summaries
    doublecounted: true, // the trades are already counted in Hyperliquid's own volume and fees
    chains: [CHAIN.HYPERLIQUID],
    start: props.start ?? "2025-08-01",
    fetch: async (options: FetchOptions) => {
      const { dailyVolume, dailyFees, dailyNotionalVolume } = await fetchBuilderCodeDataV2({ options, builderAddresses, market });
      const fees = options.createBalances();
      fees.add(dailyFees, label);

      return {
        dailyVolume,
        ...(dailyNotionalVolume ? { dailyNotionalVolume } : {}),
        dailyFees: fees,
        dailyRevenue: fees.clone(),
        dailyProtocolRevenue: fees.clone(),
        ...(props.extraReturnFields ?? {}),
      };
    },
    methodology: props.methodology ?? {
      Volume: `Volume of Hyperliquid ${name} trades placed through the builder code.`,
      ...(market === "outcome" ? { NotionalVolume: "Shares of HIP-4 outcome trades placed through the builder code, each valued at its $1 payout." } : {}),
      Fees: `Builder-code fees paid by users on Hyperliquid ${name} trades placed through the builder code.`,
      Revenue: `Builder-code fees on Hyperliquid ${name} trades, all kept by the builder.`,
      ProtocolRevenue: `Builder-code fees on Hyperliquid ${name} trades, all sent to the builder's protocol.`,
    },
  };

  if (props.breakdownFees) {
    adapter.breakdownMethodology = {
      Fees: { "Hyperliquid Builder Code Fees": "Builder code fees paid by users on Hyperliquid trades." },
      Revenue: { "Hyperliquid Builder Code Fees": "Builder code fees collected by the builder." },
      ProtocolRevenue: { "Hyperliquid Builder Code Fees": "Builder code fees collected by the builder." },
    };
  }

  if (props.deadFrom) adapter.deadFrom = props.deadFrom;

  return adapter;
}
