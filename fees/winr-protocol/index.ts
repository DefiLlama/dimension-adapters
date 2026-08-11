import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// JustBet runs on WINR Protocol. Game logic and accounting are off-chain; the
// only on-chain money flows are between the escrow and the bankroll vault,
// settled via merkle roots roughly every 5 minutes.
const BANKROLL = '0x5eD22F7693fea5A0B45dB31771aa94E941b6df8a';
const WINR = '0xD77B108d4f6cefaa0Cae9506A934e825BEccA46E';

// Escrow-only entry points on the bankroll: the house banking a win, and the
// bankroll covering a player win.
const ProfitReceived = 'event ProfitReceived(uint256 amount)';
const LossCovered = 'event LossCovered(uint256 amount)';

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const [profits, losses] = await Promise.all([
    options.getLogs({ target: BANKROLL, eventAbi: ProfitReceived }),
    options.getLogs({ target: BANKROLL, eventAbi: LossCovered }),
  ]);

  // Net house PnL. Negative on days where players win overall, which is routine.
  let net = 0n;
  profits.forEach((log: any) => { net += BigInt(log.amount) });
  losses.forEach((log: any) => { net -= BigInt(log.amount) });

  dailyFees.add(WINR, net);

  return {
    dailyFees,
    dailySupplySideRevenue: dailyFees,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
  };
};

const methodology = {
  Fees: 'Net gaming revenue captured by the bankroll, measured as WINR flowing in via ProfitReceived minus WINR flowing out via LossCovered. Gross wagered volume is not observable on-chain; games run off-chain and only net settlement reaches Arbitrum.',
  SupplySideRevenue: 'Equal to Fees. All net gaming revenue accrues to bankroll liquidity providers through share price appreciation; there is no separate distribution transaction.',
  Revenue: 'Zero. The protocol\'s own share of gaming revenue is accounted off-chain in the escrow ledger and does not appear on-chain, so it is deliberately not reported here rather than estimated.',
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: '2026-05-20', // first ProfitReceived; bankroll deployed 2026-05-19
  allowNegativeValue: true, // players win outright on some days
  methodology,
};

export default adapter;
