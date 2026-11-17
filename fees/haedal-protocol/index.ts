import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";
import { getCheckpointBeforeWindow, graphqlCall, queryEventsInWindow } from "../../helpers/sui";

// haSUI and haWAL staking pools. Every rewards update emits `{ old, new, fee }`: `new - old` is the gross reward the
// pool's validators earned and `fee` is the protocol's cut of it (config.reward_fee: 10% at launch, 6% since 2023-09).
// https://docs.haedal.xyz
const HASUI_PACKAGE = "0xbde4ba4c2e274a60ce15c1cfff9e5c42e41654ac8b6d906a57efa4bd3c29f47d";
const HAWAL_PACKAGE = "0x8b4d553839b219c3fd47608a0cc3d5fcc572cb25d41b7df3833208586a8d2470";
const HASUI_STAKING = "0x47b224762220393057ebf4f70501b6e657c3e56684737568439a04f80849b2ca";
const HASUI_STAKING_CREATED_CHECKPOINT = 11272352;
const HAWAL_STAKING = "0x9e5f6537be1a5b658ec7eed23160df0b28c799563f6c41e9becc9ad633cb592b";
const HAWAL_STAKING_CREATED_CHECKPOINT = 126926755;
// ProtocolFeeCollected was added in the 2025-10-13 upgrade, so its type lives on that package id. Before it, the haWAL
// collect emitted RewardsFeeCollected, but no haWAL fee has been collected yet under either event.
const HAWAL_PACKAGE_V4 = "0x258daa192ec47cfbc88705b0d8006a60c40f2607305411d9cde16a9cb5e876bc";

// Instant unstakes pay a service fee (config.service_fee) into a vault on the staking object: `service_sui_vault` (haSUI)
// and `protocol_wal_vault` (haWAL). In every package version that fee is the vault's only deposit, and its only withdrawal
// is the admin collect, which empties it and emits an event. So the fees in a window are the vault's growth
// between the checkpoints at its edges plus whatever was collected in between.
const getServiceFees = async (stakingId: string, createdAt: number, vault: string, collectedEvent: string, amountField: string, options: FetchOptions) => {
  const [{ sequenceNumber: from }, { sequenceNumber: to }] = await Promise.all([
    getCheckpointBeforeWindow(options.startTimestamp),
    getCheckpointBeforeWindow(options.endTimestamp),
  ]);
  const vaultAt = async (checkpoint: number) => {
    if (checkpoint < createdAt) return 0n; // the staking object did not exist yet
    const { object } = await graphqlCall(`{ object(address: "${stakingId}", atCheckpoint: ${checkpoint}) { asMoveObject { contents { json } } } }`);
    const balance = object?.asMoveObject?.contents?.json?.[vault]?.cache_pool;
    if (balance === undefined) throw new Error(`haedal: no ${vault} on ${stakingId} at checkpoint ${checkpoint}`);
    return BigInt(balance);
  };
  let collected = 0n;
  let after: string | null = null;
  while (true) {
    const { events }: any = await graphqlCall(`query ($after: String) {
      events(first: 50, after: $after, filter: { type: "${collectedEvent}", afterCheckpoint: ${from}, beforeCheckpoint: ${to + 1} }) {
        pageInfo { hasNextPage endCursor }
        nodes { contents { json } }
      }
    }`, { after });
    for (const node of events.nodes) collected += BigInt(node.contents.json[amountField]);
    if (!events.pageInfo.hasNextPage) break;
    after = events.pageInfo.endCursor;
  }
  const [start, end] = await Promise.all([vaultAt(from), vaultAt(to)]);
  const fees = end - start + collected;
  if (fees < 0n) throw new Error(`haedal: ${vault} shrank by more than was collected between checkpoints ${from} and ${to}`);
  return Number(fees) / 1e9;
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [suiRewards, walRewards, suiServiceFees, walServiceFees] = await Promise.all([
    queryEventsInWindow(`${HASUI_PACKAGE}::staking::SuiRewardsUpdated`, options),
    queryEventsInWindow(`${HAWAL_PACKAGE}::walstaking::WalRewardsUpdated`, options),
    getServiceFees(HASUI_STAKING, HASUI_STAKING_CREATED_CHECKPOINT, "service_sui_vault", `${HASUI_PACKAGE}::staking::ServiceFeeCollected`, "sui_amount", options),
    getServiceFees(HAWAL_STAKING, HAWAL_STAKING_CREATED_CHECKPOINT, "protocol_wal_vault", `${HAWAL_PACKAGE_V4}::walstaking::ProtocolFeeCollected`, "wal_amount", options),
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

  const addServiceFees = (amount: number, cgToken: string) => {
    if (amount === 0) return;
    dailyFees.addCGToken(cgToken, amount, METRIC.DEPOSIT_WITHDRAW_FEES);
    dailyRevenue.addCGToken(cgToken, amount, METRIC.DEPOSIT_WITHDRAW_FEES);
  };
  addServiceFees(suiServiceFees, "sui");
  addServiceFees(walServiceFees, "walrus-2");

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Gross staking rewards earned by haSUI and haWAL holders, plus the service fee on instant unstakes.",
  Revenue: "The protocol's fee on staking rewards (currently 6%) and the instant unstake service fee (currently 0.02%, higher earlier).",
  ProtocolRevenue: "The protocol's fee on staking rewards (currently 6%) and the instant unstake service fee (currently 0.02%, higher earlier).",
  SupplySideRevenue: "Staking rewards left to haSUI and haWAL holders after the protocol fee (currently 94%).",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.STAKING_REWARDS]: "Gross SUI and WAL staking rewards earned by Haedal's validator stake.",
    [METRIC.DEPOSIT_WITHDRAW_FEES]: "Service fee charged on instant unstakes of haSUI and haWAL (currently 0.02%, higher earlier), read as the growth of the staking object's service fee vault plus any fees collected from it.",
  },
  Revenue: {
    [METRIC.PERFORMANCE_FEES]: "Protocol fee on staking rewards (currently 6%).",
    [METRIC.DEPOSIT_WITHDRAW_FEES]: "Instant unstake service fee, kept in the protocol's vault and collected by the admin.",
  },
  ProtocolRevenue: {
    [METRIC.PERFORMANCE_FEES]: "Protocol fee on staking rewards (currently 6%).",
    [METRIC.DEPOSIT_WITHDRAW_FEES]: "Instant unstake service fee, kept in the protocol's vault and collected by the admin.",
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
