import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// STRATO (BlockApps Mercata) is a CDP protocol: users lock tokenised real
// world assets and crypto as collateral and mint the USDST stablecoin against
// them, paying a stability fee on the debt.
//
// The fee is realised when a CDP interaction pokes the engine's interest
// accrual. CDPEngine._routeFees then MINTS the accrued fee as USDST and splits
// it between the protocol's CDPReserve and the genesis FeeCollector, emitting
// one event with both legs:
// https://github.com/blockapps/strato-platform app/contracts/concrete/CDP/CDPEngine.sol
//   uint256 toReserve   = (feeUSD * feeToReserveBps) / 10000;
//   uint256 toCollector = feeUSD - toReserve;
//   Token(_usdst()).mint(address(_cdpReserve()), toReserve);
//   Token(_usdst()).mint(address(_feeCollector()), toCollector);
//   emit FeesRouted(asset, toReserve, toCollector);
// `asset` names the collateral the debt was drawn against; both amounts are
// USDST (18 decimals), not the collateral asset. feeToReserveBps is 0 on
// mainnet today, so the whole fee reaches the FeeCollector.
const CDP_ENGINE = "0x0000000000000000000000000000000000001011";
const USDST = "0x937efa7e3a77e20bbdbd7c0d32b6514f368c1010";

const FEES_ROUTED_EVENT = "event FeesRouted(address indexed asset, uint256 toReserve, uint256 toCollector)";

// noderpc.strato.nexus rejects an eth_getLogs range once it matches more than
// 1000 events, so the window is walked in chunks. The CDPEngine emits a few
// hundred events a day at most, but it is the busiest contract on the chain,
// so this stays well inside the cap.
const MAX_BLOCK_RANGE = 1000;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();

  for (let chunkFrom = fromBlock; chunkFrom <= toBlock; chunkFrom += MAX_BLOCK_RANGE) {
    const chunkTo = Math.min(chunkFrom + MAX_BLOCK_RANGE - 1, toBlock);
    const logs = await options.getLogs({
      targets: [CDP_ENGINE],
      eventAbi: FEES_ROUTED_EVENT,
      fromBlock: chunkFrom,
      toBlock: chunkTo,
    });

    for (const log of logs) {
      const toReserve = log.toReserve;
      const toCollector = log.toCollector;
      dailyFees.add(USDST, toReserve, METRIC.BORROW_INTEREST);
      dailyFees.add(USDST, toCollector, METRIC.BORROW_INTEREST);
      // Both sinks are protocol owned, so the whole stability fee is revenue
      // and there is no supply side cut: USDST debt is minted against the
      // borrower's own collateral rather than funded by depositors.
      dailyRevenue.add(USDST, toCollector, "Borrow Interest To Treasury");
      dailyRevenue.add(USDST, toReserve, "Borrow Interest To Reserve");
    }
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone() };
};

const methodology = {
  Fees: "Stability fees paid by CDP borrowers on their USDST debt, minted by the CDP engine when the debt's interest accrual is realised. Excludes the chain's own $0.01 per transaction fee, which is tracked under the Strato chain listing, and excludes AMM swap fees and lending pool borrow interest (see below).",
  Revenue: "All of it. The stability fee is split between the protocol's CDPReserve and its FeeCollector treasury, both protocol owned, and USDST debt is minted against the borrower's collateral rather than funded by depositors, so there is no supply side cut.",
  ProtocolRevenue: "Stability fees held by the FeeCollector treasury and the CDPReserve.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: "Stability fee accrued on USDST debt, read from the CDP engine's FeesRouted events (toReserve + toCollector).",
  },
  Revenue: {
    "Borrow Interest To Treasury": "Stability fee minted to the genesis FeeCollector (0x100d).",
    "Borrow Interest To Reserve": "Stability fee minted to the CDPReserve, which absorbs bad debt. 0 on mainnet today because feeToReserveBps is 0.",
  },
  ProtocolRevenue: {
    "Borrow Interest To Treasury": "Stability fee minted to the genesis FeeCollector (0x100d).",
    "Borrow Interest To Reserve": "Stability fee minted to the CDPReserve, which absorbs bad debt. 0 on mainnet today because feeToReserveBps is 0.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.STRATO],
  // The engine has routed fees since 2025-10-31 (block 108), but
  // coins.llama.fi only prices USDST from 2026-05-27 and the fee is
  // denominated in USDST, so earlier days would be stored as $0.
  start: '2026-05-27',
  methodology,
  breakdownMethodology,
};

export default adapter;
