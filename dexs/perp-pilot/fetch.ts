import { Balances } from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types";
import { fetchBuilderCodeDataV2 } from "../../helpers/hyperliquid-v2";
import { fetchLighterPartnerStats } from "../../helpers/lighter";
import { httpGet } from "../../utils/fetchURL";
import { isExtendedBuilderDashboard } from "./extended/api-types";
import { chainConfig, PERP_PILOT_CONFIG } from "./config";

const { hyperliquid, extended, nado } = PERP_PILOT_CONFIG;

async function fetchHyperliquid(options: FetchOptions) {
  const data = await fetchBuilderCodeDataV2({ options, builderAddresses: [hyperliquid.builderAddress], market: "perps" });
  const dailyFees = options.createBalances();
  dailyFees.add(data.dailyFees, hyperliquid.feesLabel);
  return { dailyVolume: data.dailyVolume, dailyFees };
}

async function fetchExtended(options: FetchOptions) {
  const res: unknown = await httpGet(extended.dashboardApi);
  if (!isExtendedBuilderDashboard(res)) throw new Error(`Extended builder dashboard returned an unexpected response: ${JSON.stringify(res).slice(0, 300)}`);
  
  // the endpoint takes no date parameter, so every call returns all builders for the last ~31 days
  const rowsOfDay = res.data.daily.filter((r) => r.date === options.dateString);

  // no builder at all on that day: it has rolled out of the window or is not published yet, so it is missing rather than zero
  if (!rowsOfDay.length) throw new Error(`Extended builder dashboard has no rows for ${options.dateString}`);

  const row = rowsOfDay.find((r) => r.builderName === extended.builderName);
  const dailyVolume = options.createBalances();

  // the day is published but has no PerpPilot row: no PerpPilot fills on Extended that day
  if (row) dailyVolume.addUSDValue(Number(row.volume));
  return { dailyVolume };
}

async function fetchNado(options: FetchOptions) {
  const logs = await options.getLogs({
    target: nado.offchainExchange,
    eventAbi: "event BuilderFeePayment(bytes32 indexed subaccount, uint32 indexed builder, uint32 indexed productId, bytes32 digest, int128 feeAmount, int128 feeRate, int128 quoteAmount)",
    topics: [null as any, null, "0x" + nado.builderId.toString(16).padStart(64, "0")],
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
  dailyFees.addUSDValue(fees, nado.feesLabel);
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
    case "extended": return fetchExtended(options); // volume only, see PERP_PILOT_CONFIG.extended
  }
};
