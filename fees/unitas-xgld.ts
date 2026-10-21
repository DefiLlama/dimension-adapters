// Website: https://www.unitas.so | Docs: https://docs.unitas.so/overview/xgld | X: https://x.com/UnitasLabs
//
// Unitas (parent) -> XGLD product (this adapter). USDu is tracked separately in fees/unitas-usdu.ts.
//
// How it works
// - XGLD is backed by XAUt. Unitas borrows USDT against the XAUt and deploys it into delta-neutral strategies.
//   Strategy yield accrues to XGLD holders through NAV appreciation (Unitas docs, "Yield Distribution")
// - NAV is the XGLDExchangeRate contract's `exchangeRate` (XAUt per XGLD, 1e6 precision). It only increases, via
//   `setExchangeRate`, which emits ExchangeRateUpdated(oldRate, newRate, updatedAt)
// - Holder yield per update = XGLD supply x (newRate - oldRate) / 1e6, denominated in XAUt, so gold price moves are not counted
// - Net strategy yield is split 80% XGLD holders / 10% Insurance Fund / 10% Treasury (Unitas docs, "Protocol Revenue" page)
//   80% holder leg is observed on-chain and the other two are derived from the documented split, same as fees/unitas-usdu.ts
// - The Insurance Fund absorbs strategy losses and negative funding for XGLD holders, so its share is
//   supply side (same treatment as fees/unitas-usdu.ts and fees/mainstreet), not revenue
// - UP token holders have no claim on revenue (docs), so there is no HoldersRevenue. Checked on-chain (Oct 2026): UP burns
//   to 0x0 are cross-chain bridge burns, and the only DEX buy by a Unitas wallet (0x01444f55..., 2026-05-22) went into
//   PancakeSwap UP/WBNB liquidity, not a buyback
// - Only BSC is tracked: XGLD supply on Base is negligible (~0.0188 XGLD)

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Documented split of net strategy yield, in basis points (Unitas docs, "Protocol Revenue" page)
const BPS = 10_000n;
const HOLDERS_SHARE_BPS = 8_000n; // 80% to XGLD holders (credited through the exchange rate)
const TREASURY_SHARE_BPS = 1_000n; // 10% to treasury / platform operations
// The remaining ~10% goes to the Insurance Fund and is computed as the remainder so the shares sum exactly

const LABELS = {
  YIELD: "Net Strategy Yield",
  TO_HOLDERS: "Yield To XGLD Holders",
  TO_TREASURY: "Yield To Treasury",
  TO_INSURANCE: "Yield To Insurance Fund",
};

// BSC contracts: Unitas docs (XGLD page) and verified sources on BscScan
// Sample TX: bscscan.com/tx/0x7d0fd338cdb4b8559f1584b45e6bcaa00dbd665f2cb04f5de7a03ae21523ba8c
const BSC = {
  xgld: "0xe60106a5cAb7e7C64830919d36Ab20CaAf50Ac91",
  xaut: "0x21cAef8A43163Eea865baeE23b9C2E327696A3bf",
  exchangeRateProvider: "0x7Bbe7FDCd6BdFFd7F767a9531b6210b87b3e46E7",
};

// XGLDExchangeRate.RATE_PRECISION (verified source)
const RATE_PRECISION = 1_000_000n;

// Verified source: all three params are non-indexed
const EXCHANGE_RATE_UPDATED_EVENT = "event ExchangeRateUpdated(uint256 oldRate, uint256 newRate, uint256 updatedAt)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  const logs = await options.getLogs({
    target: BSC.exchangeRateProvider,
    eventAbi: EXCHANGE_RATE_UPDATED_EVENT,
  });

  // The rate is updated roughly every 8 hours, so most hourly windows have no update and correctly return 0
  if (logs.length > 0) {
    const rateIncrease = logs.reduce(
      (sum: bigint, log: any) => sum + BigInt(log.newRate.toString()) - BigInt(log.oldRate.toString()),
      0n
    );

    const supply = BigInt(await options.api.call({ target: BSC.xgld, abi: "erc20:totalSupply" }));

    const holderYield = (supply * rateIncrease) / RATE_PRECISION;

    // Observed: 80% holder share. Derived from the documented split: gross yield, treasury and insurance shares.
    const grossYield = (holderYield * BPS) / HOLDERS_SHARE_BPS;
    const treasuryYield = (grossYield * TREASURY_SHARE_BPS) / BPS;
    const insuranceYield = grossYield - holderYield - treasuryYield; // remainder, keeps fees == revenue + supply side

    dailyFees.add(BSC.xaut, grossYield.toString(), LABELS.YIELD);
    dailySupplySideRevenue.add(BSC.xaut, holderYield.toString(), LABELS.TO_HOLDERS);
    dailySupplySideRevenue.add(BSC.xaut, insuranceYield.toString(), LABELS.TO_INSURANCE);
    dailyRevenue.add(BSC.xaut, treasuryYield.toString(), LABELS.TO_TREASURY);
  }

  // The treasury share is all the protocol keeps and UP holders get none, so ProtocolRevenue == Revenue (separate instance via clone)
  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
  };
};

const methodology = {
  Fees: "Net yield earned by Unitas strategies on XAUt-backed XGLD, estimated from the exchange rate increase credited to XGLD holders and their documented 80% share. Excludes the USDu product (tracked in fees/unitas-usdu).",
  Revenue: "The 10% of net strategy yield allocated to the Unitas treasury and platform operations.",
  ProtocolRevenue: "The 10% of net strategy yield allocated to the Unitas treasury and platform operations.",
  SupplySideRevenue: "The 80% of net strategy yield credited to XGLD holders through the exchange rate (NAV) increase and the 10% set aside in the Insurance Fund that backs XGLD holders. Excludes XGLD held on Base, which is immaterial.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.YIELD]: "Net strategy yield, derived as the observed XGLD holder yield divided by the documented 80% holder share.",
  },
  SupplySideRevenue: {
    [LABELS.TO_HOLDERS]: "XGLD supply multiplied by the increase in the XGLD/XAUt exchange rate (ExchangeRateUpdated events), valued in XAUt.",
    [LABELS.TO_INSURANCE]: "10% of net strategy yield allocated to the Insurance Fund, which covers strategy losses and negative funding, derived from the documented split.",
  },
  Revenue: {
    [LABELS.TO_TREASURY]: "10% of net strategy yield allocated to treasury and platform operations, derived from the documented split.",
  },
  ProtocolRevenue: {
    [LABELS.TO_TREASURY]: "10% of net strategy yield allocated to treasury and platform operations, derived from the documented split.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BSC],
  start: "2026-06-13", // first ExchangeRateUpdated event on XGLDExchangeRate
  methodology,
  breakdownMethodology,
};

export default adapter;
