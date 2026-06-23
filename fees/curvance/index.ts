/*
 * Curvance — DefiLlama Fees & Revenue adapter
 * -------------------------------------------
 * Drop this in as dimension-adapters/fees/curvance/index.ts
 *
 * This is the "indexer-style" adapter: unlike the TVL adapter (a point-in-time
 * snapshot), this aggregates `DebtAccrued` event logs over each day's block window.
 *
 * Mechanism (verified in BorrowableCToken.sol `_accrueIfNeeded`):
 *   On every interest accrual a borrowable CToken does:
 *     assetsToVest  = total interest accrued this step (added to debt AND totalAssets)
 *     protocolFee   = assetsToVest * interestFee / 10000   (minted as shares to the DAO)
 *     emit DebtAccrued(assetsToVest, protocolFee)
 *   So in the event: newDebtAssets = GROSS interest, protocolFeeAssets = the DAO's cut
 *   (which is a subset of the gross). Amounts are in the CToken's UNDERLYING asset.
 *
 * DefiLlama dimensions:
 *   dailyFees             = Σ newDebtAssets                    (interest paid by borrowers)
 *   dailyRevenue          = Σ protocolFeeAssets                (protocol/DAO cut)
 *   dailyProtocolRevenue  = Σ protocolFeeAssets                (same — all fee goes to DAO)
 *   dailySupplySideRevenue= Σ (newDebtAssets - protocolFeeAssets)  (interest paid to lenders)
 *
 * Chain: Monad mainnet only (Curvance's only production-mainnet deployment).
 */

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// CentralRegistry (Monad) — same enumeration root the live TVL adapter uses.
const CENTRAL_REGISTRY: Record<string, string> = {
  [CHAIN.MONAD]: "0x1310f352f1389969Ece6741671c4B919523912fF",
};

const DEBT_ACCRUED =
  "event DebtAccrued(uint256 newDebtAssets, uint256 protocolFeeAssets)";

async function fetch(options: FetchOptions) {
  const { api, createBalances, getLogs, chain } = options;
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  // Enumerate every CToken: CentralRegistry -> MarketManagers -> listed tokens.
  const managers: string[] = await api.call({
    target: CENTRAL_REGISTRY[chain],
    abi: "address[]:marketManagers",
  });
  const tokenLists: string[][] = await api.multiCall({
    abi: "address[]:queryTokensListed",
    calls: managers,
  });
  const cTokens: string[] = tokenLists.flat();

  // Each CToken's interest is denominated in its ERC-4626 underlying asset.
  const assets: string[] = await api.multiCall({
    abi: "address:asset",
    calls: cTokens,
    permitFailure: true,
  });

  // Collateral CTokens never emit DebtAccrued -> their log arrays come back empty.
  const logsByToken: any[][] = await getLogs({
    targets: cTokens,
    eventAbi: DEBT_ACCRUED,
    flatten: false,
  });

  logsByToken.forEach((logs, i) => {
    const asset = assets[i];
    if (!asset) return;
    for (const log of logs) {
      const interest = BigInt(log.newDebtAssets);
      const protocolFee = BigInt(log.protocolFeeAssets);
      dailyFees.add(asset, interest);
      dailyRevenue.add(asset, protocolFee);
      dailySupplySideRevenue.add(asset, interest - protocolFee);
    }
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: "Total interest accrued by borrowers across all Curvance borrowable CTokens (sum of DebtAccrued.newDebtAssets).",
    Revenue: "Protocol's interest-fee cut, minted as shares to the Curvance DAO (sum of DebtAccrued.protocolFeeAssets).",
    ProtocolRevenue: "Same as Revenue — the DAO's interest-fee share.",
    SupplySideRevenue: "Interest distributed to lenders = total interest minus the protocol fee.",
  },
  adapter: {
    [CHAIN.MONAD]: {
      fetch,
      // 2025-11-27 — Curvance's Monad launch (DefiLlama listedAt; first TVL 2025-11-28 ~$8M).
      // dimension-adapters expects start as a "YYYY-MM-DD" string. If your contract-deployer
      // broadcast shows an earlier first-market deploy, move this back — earlier only adds empty days.
      start: "2025-11-27",
    },
  },
};

export default adapter;
