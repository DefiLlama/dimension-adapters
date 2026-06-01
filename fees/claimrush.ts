import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// ClaimRush — ShareholderRoyalties (Base mainnet)
// Every Mine takeover routes ETH to this contract, which then crystallises
// each veCLAIM locker's pro-rata share. The on-chain emission of
// `ShareholderTakeoverAllocation(reignId, amountEth)` represents the gross
// ETH allocated to veCLAIM holders for that takeover.
const SHAREHOLDER_ROYALTIES = "0x74eDd39E3B220691364Df5024C3dA4FDC64d2a91";

const SHAREHOLDER_TAKEOVER_ALLOCATION =
  "event ShareholderTakeoverAllocation(uint256 indexed reignId, uint256 amountEth)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const logs = await options.getLogs({
    target: SHAREHOLDER_ROYALTIES,
    eventAbi: SHAREHOLDER_TAKEOVER_ALLOCATION,
  });

  // Sum the amountEth field across every takeover in the window.
  // `onTakeover` and the retry path `addPendingShareholderETH` each emit
  // exactly once per ETH allocation: a failed onTakeover reverts the event
  // along with its state changes, MineCore buffers the unsent wei in its
  // own `shareholderEthPending` accumulator, and the same wei resurfaces
  // in a later `addPendingShareholderETH` emission (with reignId=0).
  // Both functions are `onlyMineCore`, and MineCore guards both call sites
  // against zero-value calls (`if (amountEth == 0) return;` for the happy
  // path; `if (pending == 0) return;` for the retry). The contract's
  // `msg.value == 0` branches still exist for completeness and emit a
  // zero-amount event; the `> 0n` filter below skips those defensively.
  let totalWei = 0n;
  for (const log of logs) {
    const amount = BigInt(log.amountEth ?? 0);
    if (amount > 0n) totalWei += amount;
  }

  if (totalWei > 0n) {
    dailyFees.addGasToken(totalWei, "Takeover Royalties");
    dailyUserFees.addGasToken(totalWei, "Takeover Royalties");
    // dailyRevenue intentionally stays at 0: the protocol retains no
    // margin on the royalty stream. 100% of the fee flows to veCLAIM
    // holders as supply-side revenue, satisfying DefiLlama's income
    // statement invariant dailyRevenue == dailyFees - dailySupplySideRevenue.
    dailySupplySideRevenue.addGasToken(totalWei, "Takeover Royalties");
    dailyHoldersRevenue.addGasToken(totalWei, "Takeover Royalties");
  }

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees: "ETH paid as royalties on every Mine takeover. Gross fee volume is the sum of every `ShareholderTakeoverAllocation.amountEth` emitted by the ShareholderRoyalties contract.",
  UserFees: "Users (the new King of each takeover) pay the protocol-determined takeover price; the royalty fraction of that payment is what this adapter reports.",
  Revenue: "Zero. The protocol retains no margin on the royalty stream — every wei is forwarded to veCLAIM holders as supply-side revenue.",
  SupplySideRevenue: "100% of takeover royalty ETH is distributed to veCLAIM holders — the supply side that locks $CLAIM into voting-escrow positions and provides the royalty-bearing ve-position.",
  HoldersRevenue: "Same value as SupplySideRevenue. veCLAIM holders are the supply side in ClaimRush's ve-tokenomics: locking $CLAIM is the productive activity that earns royalty ETH.",
};

const breakdownMethodology = {
  Fees: {
    "Takeover Royalties":
      "ETH allocated to ShareholderRoyalties by MineCore on each successful takeover (via `onTakeover` and the `addPendingShareholderETH` retry path).",
  },
  UserFees: {
    "Takeover Royalties":
      "Same value — the new King of each takeover pays the royalty fraction directly out of `pricePaid`.",
  },
  Revenue: {
    "Takeover Royalties":
      "Zero — no protocol-side cut is taken before distribution.",
  },
  SupplySideRevenue: {
    "Takeover Royalties":
      "Full takeover royalty ETH, routed straight through to veCLAIM holders.",
  },
  HoldersRevenue: {
    "Takeover Royalties":
      "ETH royalties distributed to veCLAIM holders, indexed against the takeover-time shareholder set.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  start: "2026-05-19",
  chains: [CHAIN.BASE],
  methodology,
  breakdownMethodology,
};

export default adapter;
