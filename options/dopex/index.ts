import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getChainStats, getOnchainStats, IOptionMarket, ONCHAIN_LABELS } from "./clamm";
import { CHAIN } from "../../helpers/chains";

// Stryke (ex-Dopex) CLAMM option markets. Deployed addresses per chain:
// https://docs.stryke.xyz/developers/deployed-addresses/clamm (also served by
// https://api.stryke.xyz/v1.1/clamm/option-markets?chains=<chainId>, which lists markets the docs omit).
type ChainConfig = { start: number; graphUrl?: string; markets?: IOptionMarket[] };

const SONIC_USDC_E = "0x29219dd400f2Bf60E5a23d13Be72B486D4038894";

const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.ARBITRUM]: {
    graphUrl:
      "https://api.0xgraph.xyz/api/public/e2146f32-5728-4755-b1d1-84d17708c119/subgraphs/clamm-arbitrum/prod/gn",
    start: 1699794000,
  },
  [CHAIN.SONIC]: {
    markets: [
      { // WETH/USDC.e
        address: "0x9d3828e89Fadc4DEc77758988b388435Fe0f8DCa",
        callAsset: "0x50c42dEAcD8Fc9773493ED674b675bE577f2634b",
        putAsset: SONIC_USDC_E,
      },
      { // wS/USDC.e
        address: "0x342e4068bA07bbCcBDDE503b2451FAa3D3C0278B",
        callAsset: "0x039e2fB66102314Ce7b64Ce5Ce3E5183bc94aD38",
        putAsset: SONIC_USDC_E,
      },
      { // WBTC/USDC.e
        address: "0x5E44581CaF0D9b25bA5F58DD773c76039140261f",
        callAsset: "0x0555E30da8f98308EdB960aa94C0Db47230d2B9c",
        putAsset: SONIC_USDC_E,
      },
      // Registered in the CLAMM FeeStrategy (OptionMarketRegistered) but not listed by the Stryke API;
      // no options minted on them so far.
      { // wS/scUSD
        address: "0x1e3b3a28614cbab66c72b8a2f17c0bde9b3107a7",
        callAsset: "0x039e2fB66102314Ce7b64Ce5Ce3E5183bc94aD38",
        putAsset: "0xd3DCe716f3eF535C5Ff8d041c1A41C3bd89b97aE",
      },
      { // wS/USDC.e (second pool)
        address: "0xafd9352af9a75e52ba2889ba9fa3b2a960abef61",
        callAsset: "0x039e2fB66102314Ce7b64Ce5Ce3E5183bc94aD38",
        putAsset: SONIC_USDC_E,
      },
    ],
    start: 1735383288,
  },
  // [CHAIN.BASE]:   { graphUrl: ".../subgraphs/clamm-base/prod/gn",   start: 1714733688 },
  // [CHAIN.BLAST]:  { graphUrl: ".../subgraphs/clamm-blast/prod/gn",  start: 1714733688 },
  // [CHAIN.MANTLE]: { graphUrl: ".../subgraphs/clamm-mantle/prod/gn", start: 1706957688 },
};

const fetch = async (options: FetchOptions) => {
  const { graphUrl, markets } = chainConfig[options.chain];
  if (markets) return getOnchainStats(options, markets);
  return getChainStats({ graphUrl: graphUrl!, dayStart: options.startOfDay });
};

const methodology = {
  NotionalVolume:
    "Sum of totalAssetWithdrawn from LogMintOption: the call asset (calls) or put asset (puts) borrowed from concentrated-liquidity ticks to back each option, valued in USD.",
  PremiumVolume:
    "Sum of premiumAmount from LogMintOption: the premium option buyers pay, which is donated back to the LP positions whose liquidity backed the option.",
  Fees: "Protocol fees charged on top of the premium (a fixed percentage of premiumAmount set in the CLAMM FeeStrategy) and sent to the feeTo address. Premiums to LPs are not included.",
  Revenue: "All protocol fees go to the Stryke feeTo address.",
};

const breakdownMethodology = {
  Fees: {
    [ONCHAIN_LABELS.fees]: "Protocol fee charged on top of the option premium at purchase (fixed % of premium per market, set in the CLAMM FeeStrategy).",
  },
  Revenue: {
    [ONCHAIN_LABELS.revenue]: "The full protocol fee is transferred to the Stryke feeTo address.",
  },
};

const adapter: SimpleAdapter = {
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
};

export default adapter;
