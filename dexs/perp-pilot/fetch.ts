import { Balances } from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types";
import { fetchBuilderCodeDataV2 } from "../../helpers/hyperliquid-v2";
import { fetchLighterPartnerStats } from "../../helpers/lighter";
import { httpGet } from "../../utils/fetchURL";
import {
  chainConfig,
  EXTENDED_BUILDER_NAME,
  EXTENDED_BUILDERS_API,
  HL_BUILDER_ADDRESSES,
  HL_BUILDER_FEES_LABEL,
  NADO_BUILDER_FEES_LABEL,
  NADO_BUILDER_ID,
  NADO_OFFCHAIN_EXCHANGE,
} from "./config";

async function fetchHyperliquid(options: FetchOptions) {
  const data = await fetchBuilderCodeDataV2({ options, builderAddresses: HL_BUILDER_ADDRESSES, market: "perps" });
  const dailyFees = options.createBalances();
  dailyFees.add(data.dailyFees, HL_BUILDER_FEES_LABEL);
  return { dailyVolume: data.dailyVolume, dailyFees };
}

async function fetchExtended(options: FetchOptions) {
  const { data } = await httpGet(EXTENDED_BUILDERS_API);
  if (!Array.isArray(data?.daily) || !data.daily.length) throw new Error(`Extended builder dashboard returned no daily rows`);
  const oldest = data.daily.reduce((min: string, row: any) => (row.date < min ? row.date : min), data.daily[0].date);
  // days that have rolled out of the dashboard cannot be read, so they are missing rather than zero
  if (options.dateString < oldest) throw new Error(`Extended builder dashboard no longer serves ${options.dateString} (oldest ${oldest})`);
  const row = data.daily.find((i: any) => i.builderName === EXTENDED_BUILDER_NAME && i.date === options.dateString);
  const dailyVolume = options.createBalances();
  if (row) dailyVolume.addUSDValue(Number(row.volume));
  return { dailyVolume };
}

async function fetchNado(options: FetchOptions) {
  const logs = await options.getLogs({
    target: NADO_OFFCHAIN_EXCHANGE,
    eventAbi: "event BuilderFeePayment(bytes32 indexed subaccount, uint32 indexed builder, uint32 indexed productId, bytes32 digest, int128 feeAmount, int128 feeRate, int128 quoteAmount)",
    topics: [null as any, null, "0x" + NADO_BUILDER_ID.toString(16).padStart(64, "0")],
  });
  let volume = 0;
  let fees = 0;
  for (const log of logs) {
    // x18 fixed point, quote is USDT0
    volume += Math.abs(Number(log.quoteAmount)) / 1e18;
    fees += Math.abs(Number(log.feeAmount)) / 1e18;
  }
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  dailyVolume.addUSDValue(volume);
  dailyFees.addUSDValue(fees, NADO_BUILDER_FEES_LABEL);
  return { dailyVolume, dailyFees };
}

// PerpPilot keeps every builder/partner fee, so revenue and protocol revenue equal fees
const withRevenue = ({ dailyVolume, dailyFees }: { dailyVolume: Balances; dailyFees: Balances }) => ({
  dailyVolume,
  dailyFees,
  dailyRevenue: dailyFees.clone(),
  dailyProtocolRevenue: dailyFees.clone(),
});

export const fetch = async (options: FetchOptions) => {
  const config = chainConfig[options.chain];
  switch (config.venue) {
    case "hyperliquid": return withRevenue(await fetchHyperliquid(options));
    case "lighter": return withRevenue(await fetchLighterPartnerStats(options, config.lighterAccountIndex));
    case "nado": return withRevenue(await fetchNado(options));
    case "extended": return fetchExtended(options); // volume only, see EXTENDED_BUILDERS_API
  }
};
