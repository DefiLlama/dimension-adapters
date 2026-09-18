import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { addTokensReceived } from "../helpers/token";

// ArcLotls (arclotls.com) - proof-of-work NFT collectible protocol on Arc (chain id 5042).
// Minting an organism costs USDC, paid to the collection contract, which forwards 100% of it
// in one hop to a splitter that fans it out to three destinations in the same transaction.
// Collection: https://explorer.arc.io/address/0xe3AFD1f6CE33155ca26574c9a3fe14e59A337759
const SPLITTER = "0xb627A2a94Fab7bC00624335bdc913237beCACD88";

// "Eligible rent" pool paid out to NFT holders, weighted by organism stage.
// https://explorer.arc.io/address/0x18B156cc2aB7cF8173Ee837AcFe41D8A9943Aa2e
const RENT_VAULT = "0x18B156cc2aB7cF8173Ee837AcFe41D8A9943Aa2e";

// First-hop treasury wallet (it re-forwards downstream in a second, uncounted hop).
// https://explorer.arc.io/address/0x810a0Eac09BF416Dc5A6E0c5865F7f5F63769007
const TREASURY = "0x810a0Eac09BF416Dc5A6E0c5865F7f5F63769007";

// LOTL buyback-and-burn reserve, funded on every mint. Booked as HoldersRevenue at the funding
// point (same convention as fees/hashcats' $HASH buyback), not at execution: no buyback has
// actually succeeded on-chain yet as of 2026-09-18 (a queue draining on its own schedule/cap is
// normal and doesn't change how much fee revenue was genuinely earmarked for holders).
// https://explorer.arc.io/address/0x594045B5200949C3a065525bE7D9C750313b57B2
const BUYBACK_VAULT = "0x594045B5200949C3a065525bE7D9C750313b57B2";

// Arc's native gas token IS USDC, exposed as both an 18-decimal native asset and this
// 6-decimal ERC-20 facade over the same underlying balance. The splitter pays out on this
// facade, so amounts read from its Transfer logs are already correctly scaled at 6 decimals.
const USDC = ADDRESSES.arc.USDC; // 0x3600000000000000000000000000000000000000

const MINT_FEES = "Mint Fees";
const MINT_FEES_TO_RENT_POOL = "Mint Fees To Rent Pool";
const MINT_FEES_TO_TREASURY = "Mint Fees To Treasury";
const LOTL_TOKEN_BUY_BACK = "LOTL Token Buy Back";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  // The splitter fans out every mint payment to these three destinations in one hop, so
  // `fromAddressFilter` scopes each leg to that flow only (never a wallet-wide balance read).
  const [rent, treasury, buyback] = await Promise.all([
    addTokensReceived({ options, target: RENT_VAULT, token: USDC, fromAddressFilter: SPLITTER }),
    addTokensReceived({ options, target: TREASURY, token: USDC, fromAddressFilter: SPLITTER }),
    addTokensReceived({ options, target: BUYBACK_VAULT, token: USDC, fromAddressFilter: SPLITTER }),
  ]);

  dailyFees.addBalances(rent, MINT_FEES);
  dailySupplySideRevenue.addBalances(rent, MINT_FEES_TO_RENT_POOL);

  dailyFees.addBalances(treasury, MINT_FEES);
  dailyRevenue.addBalances(treasury, MINT_FEES_TO_TREASURY);
  dailyProtocolRevenue.addBalances(treasury, MINT_FEES_TO_TREASURY);

  dailyFees.addBalances(buyback, MINT_FEES);
  dailyRevenue.addBalances(buyback, LOTL_TOKEN_BUY_BACK);
  dailyHoldersRevenue.addBalances(buyback, LOTL_TOKEN_BUY_BACK);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
  };
};

const methodology = {
  Fees: "The full USDC mint-settlement price paid by miners for every ArcLotls organism, read from the three downstream shares (rent, treasury, buyback) the mint payment is split into on-chain, which always sum to 100% of the mint price. Excludes the LOTL opening-trade tax (a one-time anti-snipe launch mechanic) and any undocumented trading-fee revenue not yet observed on-chain.",
  Revenue: "Mint fees minus the share paid out as rent to NFT holders: the treasury share plus the share earmarked for the LOTL buyback-and-burn reserve.",
  ProtocolRevenue: "The treasury share of every mint (25% as observed on-chain).",
  SupplySideRevenue: "The rent share of every mint (60% as observed on-chain), paid out to NFT holders weighted by organism stage. Accrued when funded, not when claimed.",
  HoldersRevenue: "The share of every mint earmarked for buying LOTL back and burning it (15% as observed on-chain), measured at the fee source (when USDC lands in the buyback reserve) rather than at execution.",
};

const breakdownMethodology = {
  Fees: {
    [MINT_FEES]: "USDC paid by miners to mint an ArcLotls organism, summed across its three downstream shares (rent, treasury, buyback).",
  },
  Revenue: {
    [MINT_FEES_TO_TREASURY]: "Treasury's share of mint fees.",
    [LOTL_TOKEN_BUY_BACK]: "Share of mint fees earmarked for the LOTL buyback-and-burn reserve.",
  },
  ProtocolRevenue: {
    [MINT_FEES_TO_TREASURY]: "Treasury's share of mint fees.",
  },
  SupplySideRevenue: {
    [MINT_FEES_TO_RENT_POOL]: "Rent share of mint fees, paid to NFT holders.",
  },
  HoldersRevenue: {
    [LOTL_TOKEN_BUY_BACK]: "USDC earmarked for buying LOTL back and burning it, measured when it is funded rather than when the buyback executes.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  start: "2026-09-17", // day RentVault/BuybackVault were deployed, one day after Arc's public mainnet launch
  methodology,
  breakdownMethodology,
};

export default adapter;
