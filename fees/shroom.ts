import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// SHROOM token scope: genesis hook fees/tax and the MU dividend allocated to
// all SHROOM holders. This is not the treasury income statement. Treasury LP
// earnings and actual MU dividend receipts belong in shroom-treasury.ts.
// Do not add the two scopes: treasury dividends are part of the token stream.
//
// Keep the agreed sweep basis: fees and revenue use PoolFeesSwept together,
// so Fees = Revenue + SupplySideRevenue within every window. creatorAmount is
// MU allocated for holder dividends, not proof of same-window wallet receipts.
// The hook/fee escrow/distributor are shared; all hook logs pin SHROOM's poolId.

// https://robinhoodchain.blockscout.com/address/0xe5e702641Ea86F4ae6cC3cDaeD2B886F976bE044
const HOOK = "0xe5e702641ea86f4ae6cc3cdaed2b886f976be044";
// SHROOM/MU, fee 0, tickSpacing 200, hooked. Created at block 52657452.
const POOL_ID = "0xbacecf788d2279f65da62d7bf69f4de28580a88bec56847c8d2ba6fbdd73f6eb";
// https://robinhoodchain.blockscout.com/token/0xfF080c8ce2E5feadaCa0Da81314Ae59D232d4afD
const MU = "0xff080c8ce2e5feadaca0da81314ae59d232d4afd";
const poolFeesSweptAbi =
  "event PoolFeesSwept(bytes32 indexed poolId, uint256 protocolAmount, uint256 buybackAmount, uint256 creatorAmount, uint256 tokensLocked)";
const POOL_FEES_SWEPT_TOPIC = "0x2f3c43579b9064b6f28edcf41608f3815792d274a56afe024359703cb4ea9b30";

const LABEL = {
  hookFee: "Hook Fee",
  tax: "Token Tax",
  toPons: "Hook Fee To Pons",
  hookFeeToHolders: "Hook Fee To SHROOM Holders",
  taxToHolders: "Token Tax To SHROOM Holders",
};

const big = (v: any) => BigInt(v.toString());

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { api, getLogs, createBalances } = options;

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  // 1. the hook's sweeps on SHROOM's pool, all denominated in MU.
  //
  // protocolFeeShareBps is read at the block being priced rather than
  // hardcoded, so a change to Pons's cut is picked up without a backfill. It is
  // 3000 (30%) today.
  const shareBps = big(await api.call({ abi: "uint256:protocolFeeShareBps", target: HOOK }));
  const sweeps = await getLogs({
    target: HOOK,
    eventAbi: poolFeesSweptAbi,
    topics: [POOL_FEES_SWEPT_TOPIC, POOL_ID], // the hook serves every Pons launch
  });

  for (const log of sweeps) {
    const protocol = big(log.protocolAmount);
    const buyback = big(log.buybackAmount);
    const creator = big(log.creatorAmount);
    const locked = big(log.tokensLocked);
    if (buyback !== 0n || locked !== 0n)
      throw new Error("SHROOM: non-dividend sweep allocation requires a methodology review");

    // Pons's cut comes out of the hook fee only, so scaling it back up by its
    // share recovers the whole hook fee; whatever the creator got beyond its
    // 70% of that is the tax.
    const hookFee = shareBps > 0n ? (protocol * 10000n) / shareBps : protocol;
    // clamped so the creator's two legs always sum to creatorAmount and the
    // hook fee leg always covers Pons's cut, whatever the config reads
    const creatorHookFee = hookFee > protocol ? (hookFee - protocol > creator ? creator : hookFee - protocol) : 0n;
    const creatorTax = creator - creatorHookFee;

    // fees are built from the same legs the revenue split uses, so
    // dailyFees == dailyRevenue + dailySupplySideRevenue holds per sweep
    dailyFees.add(MU, creatorHookFee + protocol, LABEL.hookFee);
    dailyFees.add(MU, creatorTax, LABEL.tax);

    // Pons is the launchpad, a third party to Shroom
    dailySupplySideRevenue.add(MU, protocol, LABEL.toPons);

    dailyRevenue.add(MU, creatorHookFee, LABEL.hookFeeToHolders);
    dailyRevenue.add(MU, creatorTax, LABEL.taxToHolders);

    // All-holder MU dividend allocation; actual treasury receipts are separate.
    dailyHoldersRevenue.add(MU, creatorHookFee, LABEL.hookFeeToHolders);
    dailyHoldersRevenue.add(MU, creatorTax, LABEL.taxToHolders);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees, // every leg is charged to swappers
    dailyRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "The 1% hook fee and the ~3.33% tax PonsV2MemeHook charges on every swap of the genesis SHROOM/MU pool, read from the hook's own sweep events and denominated in MU after the hook converts the SHROOM side. Neither rate is assumed: both come from the events, and the split between Pons and the creator is read from the hook at the block being priced.",
  UserFees: "Same as Fees. The hook fee and the tax are charged to swappers.",
  Revenue: "SHROOM token revenue only: MU allocated for holder dividends in pool-filtered sweeps, excluding Pons. This is not treasury revenue and includes no treasury LP earnings.",
  HoldersRevenue: "MU allocated to all SHROOM holders from creatorAmount, recognized at the hook sweep. Actual recipient payments can occur later. Treasury holders are included in this token-wide allocation, so do not add treasury dividend receipts again.",
  SupplySideRevenue: "The 30% of the hook fee taken by Pons, the launchpad the token was issued through.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.hookFee]: "The 1% fee PonsV2MemeHook charges on every swap of the genesis SHROOM/MU pool, recovered from the sweep by scaling Pons's cut up by its configured share.",
    [LABEL.tax]: "The tax the hook charges alongside the fee, 3.33x it on every event to date. Taken as whatever the creator was swept beyond its share of the hook fee, so no rate is assumed.",
  },
  UserFees: {
    [LABEL.hookFee]: "Hook fee paid by swappers.",
    [LABEL.tax]: "Tax paid by swappers.",
  },
  Revenue: {
    [LABEL.hookFeeToHolders]: "The creator's 70% of the hook fee, which reaches SHROOM holders through the MU dividend.",
    [LABEL.taxToHolders]: "The tax, which reaches SHROOM holders through the MU dividend.",
  },
  HoldersRevenue: {
    [LABEL.hookFeeToHolders]: "The creator's 70% of the hook fee, allocated for SHROOM holders pro-rata in MU at the hook sweep; recipient payments may occur later.",
    [LABEL.taxToHolders]: "The tax, allocated for SHROOM holders pro-rata in MU at the hook sweep; recipient payments may occur later.",
  },
  SupplySideRevenue: {
    [LABEL.toPons]: "The 30% of the hook fee Pons takes as the launchpad, read from the hook's protocolFeeShareBps at the block being priced.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-09-02', // genesis pool created at block 52657452
  methodology,
  breakdownMethodology,
  pullHourly: true,
  // Genesis Swap.fee is zero; these hook charges are not Uniswap LP fees.
  doublecounted: false,
};

export default adapter;
