import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";
import { METRIC } from "../helpers/metrics";

// Every DexLab platform fee settles in SOL to this one address. It is the fee
// destination held by the Minting Lab token factory program's config account
// (program EeHfbcv8g1qE4wdWF3gWNrzYia3jYJngR44Fuijd5CiJ, PDA seed
// "mintinglab:config-account"), and the same address receives the token
// management, OpenBook market creation and Multisender fees.
const FEE_WALLET = 'AvpdLZGKjghJgdpctNgXT1L7bXKq2ifKiGYBGjeVugWC';

// SOL that DexLab sends to its own fee wallet is not user revenue, and there is
// no shape to it on chain that tells it apart from a user paying a fee. Both of
// these are DexLab wallets, found by reading every inflow to the fee wallet and
// looking at the ones larger than a single action can produce. The largest fee
// one action can charge is the Multisender batch cap of 0.3 SOL, so anything
// materially above that did not come from a user.
//
//   2TUHrApH...  the program deploy payer. Returned rent when a retired program
//                was closed on 2026-06-15: 3.7171 and 2.9786 SOL.
//   CH4uMXS8...  a treasury wallet. Sent 0.8733 SOL back on 2026-05-21, the same
//                day the fee wallet was swept into it.
//
// Against a run rate near 4 SOL a week, leaving these in would publish two days
// that look like large spikes and are not revenue at all. blacklists filters
// from_address, which is what these are; blacklist_signers is the separate
// option for signers.
const INTERNAL_SENDERS = [
  '2TUHrApHJ18EaSbzNWPdP9Kmbum5smLXuvy5MCwCAssx',
  'CH4uMXS8EcTDARNSjz6pdHMz5tggSzGio6H1v53s7zzd',
];

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const fees = await getSolanaReceived({
    options,
    target: FEE_WALLET,
    blacklists: INTERNAL_SENDERS,
  });
  dailyFees.addBalances(fees, METRIC.PROTOCOL_FEES);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  dependencies: [Dependencies.ALLIUM],
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      // The wallet's oldest signature, 5oqJv62p6wt9VgWNsHfssB75EiuZJC4DNcRViQ
      // CfBAv8iCNGDvHNmsPw1vBdK5bsaUkpF7eLkardk3AGHXqGeN9A, received exactly
      // 0.15 SOL at 2024-11-12 01:03 UTC and is a token creation fee, so this
      // start date is measured rather than estimated.
      start: '2024-11-12',
    },
  },
  methodology: {
    Fees: 'Flat SOL fees paid by users to create a token, manage a token, create an OpenBook market and bulk send tokens on DexLab, received by the DexLab fee wallet on Solana.',
    Revenue: 'All fees are kept by DexLab. There is no supplier side and no token holder share.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.PROTOCOL_FEES]: 'All flat SOL fees received by the DexLab fee wallet on Solana, retained entirely by the protocol.',
    },
  },
};

export default adapter;
