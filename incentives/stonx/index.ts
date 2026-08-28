import { Adapter, FetchOptions, FetchResultIncentives, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const VE33 = "0xD18685A514E59b06d59824e16Db07e73345d9953";
const STONX = "0x570c5aa79c798e7a418412cc8399ae5bcce570c5";
const DEPLOYMENT_BLOCK = 18_269_246;
const Q32 = 1n << 32n;

const EMISSIONS_SCHEDULED_EVENT =
  "event EmissionsScheduled(address funder, uint64 startTime, uint64 endTime, uint160 rewardRate, uint128 amount)";

/** Return the STONX emitted by every schedule overlapping the requested period. */
const fetch = async (options: FetchOptions): Promise<FetchResultIncentives> => {
  const tokenIncentives = options.createBalances();
  const toBlock = await options.getToBlock();
  const schedules = await options.getLogs({
    target: VE33,
    eventAbi: EMISSIONS_SCHEDULED_EVENT,
    fromBlock: DEPLOYMENT_BLOCK,
    toBlock,
    cacheInCloud: true,
  });

  for (const schedule of schedules) {
    const overlapStart = Math.max(options.startTimestamp, Number(schedule.startTime));
    const overlapEnd = Math.min(options.endTimestamp, Number(schedule.endTime));
    if (overlapEnd <= overlapStart) continue;

    const emitted = (BigInt(schedule.rewardRate) * BigInt(overlapEnd - overlapStart)) / Q32;
    tokenIncentives.add(STONX, emitted);
  }

  return { tokenIncentives };
};

const adapter: Adapter = {
  version: 2,
  fetch,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-31",
  protocolType: ProtocolType.PROTOCOL,
  methodology:
    "STONX incentives scheduled by the deployed Ekubo Ve33 contract for liquidity providers. Each on-chain emission schedule is prorated to the requested time period using its Q32 reward rate, before pool-level allocation and claims.",
};

export default adapter;
