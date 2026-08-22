import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// JustBet runs on WINR Protocol. Game logic and accounting are off-chain; the
// only on-chain money flows are between the escrow and the bankroll vault,
// settled via merkle roots roughly every 5 minutes.

// WINRBankroll - https://arbiscan.io/address/0x5eD22F7693fea5A0B45dB31771aa94E941b6df8a
const BANKROLL = '0x5eD22F7693fea5A0B45dB31771aa94E941b6df8a';
// WINR token, 18 decimals - https://arbiscan.io/token/0xD77B108d4f6cefaa0Cae9506A934e825BEccA46E
const WINR = '0xD77B108d4f6cefaa0Cae9506A934e825BEccA46E';

// Escrow-only entry points on the bankroll: the house banking a win, and the
// bankroll covering a player win.
const ProfitReceived = 'event ProfitReceived(uint256 amount)';
const LossCovered = 'event LossCovered(uint256 amount)';

const FEE_LABEL = 'Net Gaming Revenue';
const LP_LABEL = 'Net Gaming Revenue To LPs';

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [profits, losses] = await Promise.all([
    options.getLogs({ target: BANKROLL, eventAbi: ProfitReceived }),
    options.getLogs({ target: BANKROLL, eventAbi: LossCovered }),
  ]);

  // Net house PnL. Negative on days where players win overall, which is routine.
  let net = 0n;
  profits.forEach((log: any) => { net += BigInt(log.amount) });
  losses.forEach((log: any) => { net -= BigInt(log.amount) });

  dailyFees.add(WINR, net, FEE_LABEL);
  dailySupplySideRevenue.add(WINR, net, LP_LABEL);

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
  };
};

const methodology = {
  Fees: 'Net gaming revenue (NGR) settled to the bankroll, measured as WINR received via ProfitReceived minus WINR paid out via LossCovered. This is an NGR figure standing in for a Fees field that conventionally carries GGR: gross wagered turnover is not observable on-chain because games run off-chain, and creator rewards, affiliate commissions and VIP cashback are already deducted in the off-chain escrow ledger before settlement. NGR is the most complete figure derivable from chain data, and this is a known limitation rather than an omission.',
  SupplySideRevenue: 'Equal to Fees. All settled net gaming revenue accrues to bankroll liquidity providers through share price appreciation; there is no separate distribution transaction.',
  Revenue: 'Zero. No protocol share is deducted on-chain - a 30 day reconciliation shows 100% of settled net gaming revenue accruing to bankroll liquidity providers through share price appreciation, with no leakage to any other on-chain party. The protocol does capture revenue at the application layer, but it is charged and accounted entirely off-chain and is not derivable from chain data, so it is deliberately not estimated here.',
  ProtocolRevenue: 'Zero, for the same reason as Revenue: no protocol share is taken on-chain, and application-layer revenue is not observable from chain data.',
};

const breakdownMethodology = {
  Fees: {
    [FEE_LABEL]: 'WINR received by the bankroll via ProfitReceived minus WINR paid out via LossCovered, per ~5 minute settlement.',
  },
  SupplySideRevenue: {
    [LP_LABEL]: 'The same net amount, accruing to bankroll liquidity providers through share price appreciation rather than a distribution transaction.',
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: '2026-05-20', // first ProfitReceived; bankroll deployed 2026-05-19
  allowNegativeValue: true, // players win outright on some days
  methodology,
  breakdownMethodology,
};

export default adapter;
