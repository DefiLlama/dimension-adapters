import { Balances } from "@defillama/sdk";
import { FetchOptions, FetchResultV2 } from "../../adapters/types";
import { fetchBuilderCodeDataV2 } from "../../helpers/hyperliquid-v2";
import { fetchBuilderData } from "../../helpers/extended-exchange";
import { fetchLighterPartnerStats } from "../../helpers/lighter";
import { chainConfig, PERP_PILOT_CONFIG } from "./config";

const { hyperliquid, extended, nado } = PERP_PILOT_CONFIG;

async function fetchHyperliquid(options: FetchOptions) {
  const data = await fetchBuilderCodeDataV2({ options, builderAddresses: [hyperliquid.builderAddress], market: "perps" });
  const dailyFees = options.createBalances();
  dailyFees.add(data.dailyFees, hyperliquid.feesLabel);
  return { dailyVolume: data.dailyVolume, dailyFees };
}

async function fetchNado(options: FetchOptions) {
  const logs = await options.getLogs({
    target: nado.offchainExchange,
    // field names describe the values: builderFee is the builder fee and fee is Nado's own fee of the fill, both in quote
    // (on 1.5 bp builder fills builderFee = 1.5 bp and fee = 1 bp of the gross amount)
    eventAbi: "event BuilderFeePayment(bytes32 indexed subaccount, uint32 indexed builder, uint32 indexed productId, bytes32 digest, int128 builderFee, int128 fee, int128 quoteAmount)",
    topics: [null as any, null, "0x" + nado.builderId.toString(16).padStart(64, "0")],
  });

  let volume = 0;
  let fees = 0;
  for (const log of logs) {
    // x18 fixed point, quote is USDT0
    const quote = Number(log.quoteAmount) / 1e18;
    const builderFee = Math.abs(Number(log.builderFee)) / 1e18;
    const nadoFee = Math.abs(Number(log.fee)) / 1e18;
    // quoteAmount is emitted after applyFee took both fees, so volume adds them back to get the gross trade value:
    // a sell (positive quote) received gross minus fees, a buy (negative quote) paid gross plus fees
    volume += quote >= 0 ? quote + builderFee + nadoFee : -quote - builderFee - nadoFee;
    fees += builderFee;
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

export const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const config = chainConfig[options.chain];
  switch (config.venue) {
    case "hyperliquid": return withRevenue(await fetchHyperliquid(options));
    case "lighter": return withRevenue(await fetchLighterPartnerStats(options, config.lighterAccountIndex));
    case "nado": return withRevenue(await fetchNado(options));
    case "extended": {
      // Volume only: without a builderFeeRate the helper's fees are Extended's own trading fees, not PerpPilot's builder
      // fee, and PerpPilot's builder rate varies by plan and bot. A day the dashboard does not serve (older than ~31 days,
      // or not published yet) returns $0 volume, so an Extended gap never blocks the other chains of that day.
      const { dailyVolume } = await fetchBuilderData({ options, builderNames: [extended.builderName] });
      return { dailyVolume };
    }
  }
};
