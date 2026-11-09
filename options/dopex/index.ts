import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getChainStats, getOnchainStats, getCurrentClammStats, getCurrentMarkets, IOptionMarket, ONCHAIN_LABELS } from "./clamm";
import { CHAIN } from "../../helpers/chains";

// Stryke (ex-Dopex) CLAMM option markets. Deployed addresses per chain:
// https://docs.stryke.xyz/developers/deployed-addresses/clamm (also served by
// https://api.stryke.xyz/v1.1/clamm/option-markets?chains=<chainId>, which lists markets the docs omit).
type ChainConfig = { start: string; graphUrl?: string; markets?: IOptionMarket[] };

const SONIC_USDC_E = ADDRESSES.sonic.USDC_e;

const chainConfig: Record<string, ChainConfig> = {
  // FeeStrategy/first option market deployed at block 65228887/65228888.
  // Current market catalogue: https://stryke-api-v2-robinhood.up.railway.app/v1/markets
  [CHAIN.ROBINHOOD]: { start: '2026-09-17' },
  [CHAIN.ARBITRUM]: {
    graphUrl:
      "https://api.0xgraph.xyz/api/public/e2146f32-5728-4755-b1d1-84d17708c119/subgraphs/clamm-arbitrum/prod/gn",
    start: '2023-11-12',
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
        callAsset: ADDRESSES.sonic.wS,
        putAsset: SONIC_USDC_E,
      },
      { // WBTC/USDC.e
        address: "0x5E44581CaF0D9b25bA5F58DD773c76039140261f",
        callAsset: ADDRESSES.bsc.WBTC,
        putAsset: SONIC_USDC_E,
      },
      // Registered in the CLAMM FeeStrategy (OptionMarketRegistered) but not listed by the Stryke API;
      // no options minted on them so far.
      { // wS/scUSD
        address: "0x1e3b3a28614cbab66c72b8a2f17c0bde9b3107a7",
        callAsset: ADDRESSES.sonic.wS,
        putAsset: ADDRESSES.sonic.scUSD,
      },
      { // wS/USDC.e (second pool)
        address: "0xafd9352af9a75e52ba2889ba9fa3b2a960abef61",
        callAsset: ADDRESSES.sonic.wS,
        putAsset: SONIC_USDC_E,
      },
    ],
    start: '2024-12-28',
  },
  // [CHAIN.BASE]:   { graphUrl: ".../subgraphs/clamm-base/prod/gn",   start: '2024-05-03' },
  // [CHAIN.BLAST]:  { graphUrl: ".../subgraphs/clamm-blast/prod/gn",  start: '2024-05-03' },
  // [CHAIN.MANTLE]: { graphUrl: ".../subgraphs/clamm-mantle/prod/gn", start: '2024-02-03' },
};

const fetch = async (options: FetchOptions) => {
  if (options.chain === CHAIN.ROBINHOOD) return getCurrentClammStats(options);
  const { graphUrl, markets } = chainConfig[options.chain];
  if (markets) return getOnchainStats(options, markets);
  if (options.chain === CHAIN.ARBITRUM) {
    const currentMarkets = await getCurrentMarkets(options);
    const current = await getCurrentClammStats(options, currentMarkets);
    // Retain legacy history; explicitly exclude current markets if the graph is
    // later extended to index them, so every purchase is still counted once.
    const legacy = await getChainStats({ graphUrl: graphUrl!, dayStart: options.startOfDay, excludeMarkets: currentMarkets });
    current.dailyNotionalVolume.addUSDValue(legacy.dailyNotionalVolume);
    current.dailyPremiumVolume.addUSDValue(legacy.dailyPremiumVolume);
    current.dailyFees.addUSDValue(legacy.dailyFees, ONCHAIN_LABELS.fees);
    current.dailyRevenue.addUSDValue(legacy.dailyRevenue, ONCHAIN_LABELS.revenue);
    return current;
  }
  return getChainStats({ graphUrl: graphUrl!, dayStart: options.startOfDay });
};

const methodology = {
  NotionalVolume:
    "Call assets (calls) or put assets (puts) borrowed from concentrated-liquidity ticks to back purchased options, valued in USD; recorded as totalAssetWithdrawn on legacy markets and size on Robinhood.",
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
