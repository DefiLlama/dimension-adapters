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

// ─────────────────────────── Not counted here ───────────────────────────
// Each exclusion below is blocked on something upstream, with the condition
// that unblocks it. None of them are "todo, someday": they are omitted because
// the available number would silently undercount.
//
// 1. AMM swap fees, and a `dexs/strato.ts` volume adapter.
//    Blocked: `eth_getLogs` reconstructs logs on read from the chain's Cirrus
//    indexer and resolves the event definition by NAME across every contract in
//    the emitting contract's CodeCollection, so `Pool.Swap` wins over
//    `PoolV3.Swap` alphabetically and the encoder zero-fills the fields whose
//    names don't match. 5 of the 10 active PoolV3 pools (89% of V3 swaps) return
//    topic0 `0xcd3829a3…` (the constant-product `Swap(address,address,address,
//    uint256,uint256)`) with 5 words and only `sender` populated, instead of
//    topic0 `0x44714a36…` with 7 words. Split is exactly by code hash:
//    `5163aa10…` broken, `66e74a8f…` correct. The pools' own ABIs are identical
//    and correct, and Cirrus holds the right values, so nothing is lost on chain.
//    Resume when: this returns 7 populated words matching the Cirrus row —
//      eth_getLogs { fromBlock: 0x36860, toBlock: 0x36860,
//                    address: 0x2869b1391b1bc0aa908b1a2e4a157cd289c18584 }
//    Because logs are derived on read, a node fix retroactively repairs every
//    past block, so the follow-up adapter can backfill from V3 genesis.
//    Then: V3 is canonical Uniswap v3 — fee = inputAmount * pool.fee() / 1e6,
//    protocol cut = fee / feeProtocol when feeProtocol > 0 (`fee()` is 3000 and
//    `feeProtocol()` is 0 on `0x961d5c8a…` today, i.e. all of it to LPs).
//    Pools come from PoolV3Factory.allPools
//    (`0x5d630126d908b46bcf8d00bc15e591a459375809`), enumerated until it
//    reverts — there is no length getter.
//
// 2. Constant-product `Pool` swap fees.
//    These decode correctly over eth_getLogs today and are exactly derivable:
//      fee = amountIn * swapFeeRate() / 10000
//      lpFee = fee * lpSharePercent() / 10000        -> supply side
//      protocolFee = fee - lpFee                     -> transferred to 0x100d
//    Both getters return 0 on a pool that hasn't overridden them, in which case
//    PoolFactory (`0x…100a`) supplies the defaults, currently 30 and 7000.
//    Held back only so the swap-fee category lands in one piece: counting these
//    9 pools while V3's 12 are unreadable would undercount most swap activity.
//
// 3. StablePool swap fees.
//    Blocked on a contract change, not a node fix: the fee is dynamic per swap
//    and credited to in-contract `adminBalances`, and the `Swap` event carries
//    only amountIn/amountOut, so there is no way to derive it from logs. Needs
//    the fee emitted on `Swap` or a dedicated fee event.
//
// 4. Lending pool borrow interest — accrues into an index with no event.
// 5. Bridge fees — belong to the separate `strato-bridge` listing.
// ─────────────────────────────────────────────────────────────────────────

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
