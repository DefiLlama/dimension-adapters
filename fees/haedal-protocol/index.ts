import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";
import { queryEventsInWindow } from "../../helpers/sui";

// haSUI and haWAL staking pools. Every rewards update emits `{ old, new, fee }`: `new - old` is the gross reward the
// pool's validators earned and `fee` is the protocol's cut of it (config.reward_fee: 10% at launch, 6% since 2023-09).
// https://docs.haedal.xyz
const HASUI_PACKAGE = "0xbde4ba4c2e274a60ce15c1cfff9e5c42e41654ac8b6d906a57efa4bd3c29f47d";
const HAWAL_PACKAGE = "0x8b4d553839b219c3fd47608a0cc3d5fcc572cb25d41b7df3833208586a8d2470";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [suiRewards, walRewards] = await Promise.all([
    queryEventsInWindow(`${HASUI_PACKAGE}::staking::SuiRewardsUpdated`, options),
    queryEventsInWindow(`${HAWAL_PACKAGE}::walstaking::WalRewardsUpdated`, options),
  ]);

  const addRewards = (events: any[], cgToken: string) => {
    for (const e of events) {
      const gross = Number(BigInt(e.new) - BigInt(e.old)) / 1e9;
      if (gross <= 0) continue;
      const fee = Number(e.fee) / 1e9;
      dailyFees.addCGToken(cgToken, gross, METRIC.STAKING_REWARDS);
      dailyRevenue.addCGToken(cgToken, fee, METRIC.PERFORMANCE_FEES);
      dailySupplySideRevenue.addCGToken(cgToken, gross - fee, METRIC.STAKING_REWARDS);
    }
  };
  addRewards(suiRewards, "sui");
  addRewards(walRewards, "walrus-2");

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Gross staking rewards earned by haSUI and haWAL holders.",
  Revenue: "The protocol's fee on staking rewards (currently 6%).",
  ProtocolRevenue: "The protocol's fee on staking rewards (currently 6%).",
  SupplySideRevenue: "Staking rewards left to haSUI and haWAL holders after the protocol fee (currently 94%).",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.STAKING_REWARDS]: "Gross SUI and WAL staking rewards earned by Haedal's validator stake.",
  },
  Revenue: {
    [METRIC.PERFORMANCE_FEES]: "Protocol fee on staking rewards (currently 6%).",
  },
  ProtocolRevenue: {
    [METRIC.PERFORMANCE_FEES]: "Protocol fee on staking rewards (currently 6%).",
  },
  SupplySideRevenue: {
    [METRIC.STAKING_REWARDS]: "Staking rewards left to haSUI and haWAL holders after the protocol fee.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SUI],
  start: "2023-08-24",
  methodology,
  breakdownMethodology,
};

export default adapter;
