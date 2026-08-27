import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpPost } from "../utils/fetchURL";

// Robin (dotrobin.xyz) — ENS-standard naming on Robinhood Chain (chainId 4663).
// Fees are name registrations + renewals (annual rentals), paid in ETH or USDG
// to the RobinRegistrarController (0x9080E579fa9776EFe4531004aBe78D8f25480f77).
//
// The controller emits ENS-style NameRegistered/NameRenewed events with
// amounts "in the payment asset used" — the currency is not a field of the
// event itself (it is derived from the USDG transfer in the same transaction),
// so this adapter reads robin's open-source indexer, which tags every fee
// event with its currency. The indexer is self-hostable against any Robinhood
// Chain RPC (`ponder start`, github.com/dotrobinxyz/robin → indexer/), and
// every event it serves carries the on-chain txHash for spot-checking.

const GRAPHQL = "https://api.dotrobin.xyz/graphql";
// Global Dollar (USDG, 6 decimals) on Robinhood Chain — the protocol's stable
// payment asset. Source-verified:
// https://robinhoodchain.blockscout.com/token/0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

const REGISTRATION = "Name registration fees";
const RENEWAL = "Name renewal fees";

// Window is [startTimestamp, endTimestamp): the runner's endTimestamp is the
// next window's boundary, so the upper bound must be exclusive (timestamp_lt)
// or adjacent windows would double-count boundary events.
const query = `query ($from: BigInt!, $to: BigInt!, $after: String) {
  registrationEvents(
    where: { timestamp_gte: $from, timestamp_lt: $to }
    limit: 1000
    after: $after
  ) {
    items { kind currency baseCost premium }
    pageInfo { hasNextPage endCursor }
  }
}`;

type FeeEvent = {
  kind: string;
  currency: string;
  baseCost: string;
  premium: string;
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  let after: string | null = null;
  do {
    const res = await httpPost(
      GRAPHQL,
      {
        query,
        variables: {
          from: String(options.startTimestamp),
          to: String(options.endTimestamp),
          after,
        },
      },
      { timeout: 30_000 },
    );
    const page = res.data.registrationEvents;
    const events: FeeEvent[] = page.items;
    for (const ev of events) {
      const amount = BigInt(ev.baseCost) + BigInt(ev.premium);
      const label = ev.kind === "renewal" ? RENEWAL : REGISTRATION;
      if (ev.currency === "USDG") dailyFees.add(USDG, amount, label);
      else dailyFees.addGasToken(amount, label);
    }
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Name registration and renewal fees for .robin names (annual rentals, plus temporary Dutch-auction premiums on recently expired names), paid in ETH or USDG.",
  Revenue:
    "Same as fees: 100% of registration and renewal costs accrue to the protocol treasury (a 2-of-3 Safe). There are no third-party fee splits.",
  ProtocolRevenue: "Same as revenue — all fees accrue to the protocol treasury.",
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-08-20", // robin mainnet deploy on Robinhood Chain
  methodology,
  breakdownMethodology: {
    Fees: {
      [REGISTRATION]:
        "Cost paid to register .robin names (base cost plus any temporary premium on recently expired names), in ETH or USDG.",
      [RENEWAL]: "Cost paid to renew .robin names, in ETH or USDG.",
    },
  },
};

export default adapter;
