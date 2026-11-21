import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchHyperliquidSpotFeesByToken } from "../../helpers/hyperliquid";

/**
 * Kinetiq deployed KNTQ as a HIP-1 spot token and takes the deployer's cut of the trading fees on
 * it. `deployerTradingFeeShare` reads 1.0 on the token, so the whole of that cut is collected by Kinetiq.
 *
 * Hyperliquid charges a spot fee in whichever token the filler receives, and the deployer's share
 * applies only to the fees paid in its own token. KNTQ trades solely on the two pairs Kinetiq
 * deployed — @334 KNTQ/USDC and @254 KNTQ/USDH — so every KNTQ-denominated spot fee on Hyperliquid
 * is this deployer's, and the USDC and USDH side of those same trades is Hyperliquid's. That side
 * is already counted by the hyperliquid-spot adapter, so it is not repeated here.
 *
 * Independent of kinetiq-markets: that adapter covers perps, builder codes and the HIP-3 dex, none
 * of which touch spot.
 *
 * The deployer (0x51172933b60847085e2a959e860e2ec9e240ac09) forwards all of it to the Hyperliquid Assistance
 * Fund (0xfefefefefefefefefefefefefefefefefefefefe), which has never sent or sold KNTQ: holders revenue
 * (https://kinetiq.xyz/docs/kntq; first transfer tx 0x3741452baf3c41e238bb0430cfdda30208d400114a3f60b4db09f07e6e301bcc).
 */

const KNTQ = "KNTQ";
const KNTQ_CG_ID = "kinetiq";

const METRICS = {
  DeployerFees: "KNTQ Spot Deployer Fees",
  FeesToAssistanceFund: "KNTQ Fees To Assistance Fund",
};

const methodology = {
  Fees: "Trading fees paid in KNTQ on Hyperliquid spot, which is the side of a KNTQ trade the HIP-1 deployer's share applies to.",
  Revenue: "All of the trading fees paid in KNTQ on Hyperliquid spot. deployerTradingFeeShare on KNTQ is 1.0, so the deployer collects the whole KNTQ-denominated fee.",
  ProtocolRevenue: "None: Kinetiq sends every KNTQ it collects as the token's deployer to the Hyperliquid Assistance Fund and keeps none of it.",
  HoldersRevenue: "All of the trading fees paid in KNTQ on Hyperliquid spot, which the deployer sends to the Hyperliquid Assistance Fund; the fund has not sold or moved any of that KNTQ to date.",
};

const breakdownMethodology = {
  Fees: {
    [METRICS.DeployerFees]: "Spot trading fees denominated in KNTQ.",
  },
  Revenue: {
    [METRICS.DeployerFees]: "Collected in full by Kinetiq as the token's deployer.",
  },
  HoldersRevenue: {
    [METRICS.FeesToAssistanceFund]: "KNTQ trading fees sent by the deployer to the Hyperliquid Assistance Fund, which has not sold or moved any of that KNTQ to date.",
  },
};

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const fees = await fetchHyperliquidSpotFeesByToken({ options, token: KNTQ });

  dailyFees.addCGToken(KNTQ_CG_ID, fees, METRICS.DeployerFees);
  dailyRevenue.addCGToken(KNTQ_CG_ID, fees, METRICS.DeployerFees);
  dailyHoldersRevenue.addCGToken(KNTQ_CG_ID, fees, METRICS.FeesToAssistanceFund);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: 0, dailyHoldersRevenue };
}

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: "2025-11-28", // first day KNTQ has a price, so the first day it traded
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
