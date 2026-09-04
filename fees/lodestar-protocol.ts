import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Lodestar — no-liquidation fixed-term lending on Flare.
//
// Unlike a rate-based money market, a borrower pays ONE flat fee up front when the loan is opened,
// deducted from the principal, and nothing accrues afterwards. So fees are event-driven, not a
// function of utilisation over time:
//   LoanOpened.fee   — the origination fee for the chosen term/LTV tier
//   LoanRolled.addFee — charged again when a borrower extends into a new term
//
// The split between lenders and the protocol reserve is on-chain and governance-settable
// (`feeReserveBps`), so it is read per-run rather than hardcoded — a Safe change would otherwise
// silently make this adapter wrong. It is 30% to the reserve / 70% to lenders as of 2026-09-02.
const BOOK = "0x9b479f47ef25E0Ed2134F38d3c4e1022A8695ed8";
const USDT0 = "0xe7cd86e13AC4309349F30B3435a9d337750fC82D"; // fees are always paid in the pool asset

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [opened, rolled] = await Promise.all([
    options.getLogs({
      target: BOOK,
      eventAbi:
        "event LoanOpened(uint256 indexed id, address indexed borrower, address indexed collateral, uint256 collAmount, uint256 principal, uint256 fee, uint64 dueAt)",
    }),
    options.getLogs({
      target: BOOK,
      eventAbi: "event LoanRolled(uint256 indexed id, uint64 newDueAt, uint256 addFee)",
    }),
  ]);

  const reserveBps = Number(
    await options.api.call({ target: BOOK, abi: "function feeReserveBps() view returns (uint16)" })
  );

  let total = BigInt(0);
  for (const log of opened) total += BigInt(log.fee);
  for (const log of rolled) total += BigInt(log.addFee);

  const toReserve = (total * BigInt(reserveBps)) / BigInt(10000);
  const toLenders = total - toReserve;

  dailyFees.add(USDT0, total);
  dailyProtocolRevenue.add(USDT0, toReserve);
  dailySupplySideRevenue.add(USDT0, toLenders);

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.FLARE],
  start: "2026-08-29", // LodestarLoanBook genesis, Flare block 68517390
  methodology: {
    Fees: "One-time fee paid by borrowers when a loan is opened, plus the additional fee paid when a loan is extended into a new term. Lodestar charges no interest, so there are no accruing borrow costs.",
    Revenue: "The share of borrower fees routed to the protocol's first-loss reserve, set on-chain by feeReserveBps (30% as of 2026-09-02).",
    ProtocolRevenue: "The share of borrower fees routed to the protocol's first-loss reserve.",
    SupplySideRevenue: "The remaining share of borrower fees accruing to lenders in the USDT0 pool (70% as of 2026-09-02).",
  },
};

export default adapter;
