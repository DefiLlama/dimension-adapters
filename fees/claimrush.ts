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
    dailyRevenue.addGasToken(totalWei, "Takeover Royalties");
    dailyHoldersRevenue.addGasToken(totalWei, "Takeover Royalties To veCLAIM Holders");
  }

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue:0,
  };
};

const methodology = {
  Fees: "ETH paid as royalties on every Mine takeover. Gross protocol revenue is the sum of every `ShareholderTakeoverAllocation.amountEth` emitted by the ShareholderRoyalties contract.",
  Revenue: "ETH paid as royalties on every Mine takeover.",
  HoldersRevenue: "100% of takeover royalty ETH is allocated to veCLAIM holders pro-rata to their veCLAIM weight at the time of allocation. Holders claim accrued ETH directly from the ShareholderRoyalties contract.",
  UserFees: "Users (the new King of each takeover) pay the protocol-determined takeover price; the royalty fraction of that payment is what this adapter reports.",
  SupplySideRevenue: "No supply side revenue.",
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
      "ETH allocated to ShareholderRoyalties by MineCore on each successful takeover (via `onTakeover` and the `addPendingShareholderETH` retry path).",
  },
  HoldersRevenue: {
    "Takeover Royalties To veCLAIM Holders":
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
