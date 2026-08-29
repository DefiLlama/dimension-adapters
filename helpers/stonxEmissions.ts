import { FetchOptions } from "../adapters/types";

// Deployed Ekubo Ve33 extension on Robinhood Chain.
// https://robinhoodchain.blockscout.com/address/0xD18685A514E59b06d59824e16Db07e73345d9953
const VE33 = "0xD18685A514E59b06d59824e16Db07e73345d9953";
// stakeToken() for the deployed Ve33 extension resolves to this STONX contract.
// https://robinhoodchain.blockscout.com/token/0x570c5aa79c798e7a418412cc8399ae5bcce570c5
export const STONX = "0x570c5aa79c798e7a418412cc8399ae5bcce570c5";
// Ve33 contract deployment block on Robinhood Chain.
// https://robinhoodchain.blockscout.com/address/0xD18685A514E59b06d59824e16Db07e73345d9953
const DEPLOYMENT_BLOCK = 18_269_246;
// Ekubo stores emission rates as tokens per second in Q32 fixed-point format.
// https://github.com/EkuboProtocol/evm-contracts/blob/main/src/lens/Ve33DataFetcher.sol#L121-L123
const Q32 = 1n << 32n;

export const STONX_LP_INCENTIVES = "STONX LP Incentives";

// https://github.com/EkuboProtocol/evm-contracts/blob/main/src/interfaces/extensions/IVe33.sol#L86-L87
const EMISSIONS_SCHEDULED_EVENT =
  "event EmissionsScheduled(address funder, uint64 startTime, uint64 endTime, uint160 rewardRate, uint128 amount)";

/** Return scheduled STONX emissions overlapping the requested period. */
export async function getStonxEmissions(options: FetchOptions): Promise<bigint> {
  const toBlock = await options.getToBlock();
  const schedules = await options.getLogs({
    targets: [VE33],
    eventAbi: EMISSIONS_SCHEDULED_EVENT,
    fromBlock: DEPLOYMENT_BLOCK,
    toBlock,
    cacheInCloud: true,
  });

  let totalEmitted = 0n;
  for (const schedule of schedules) {
    const overlapStart = Math.max(options.startTimestamp, Number(schedule.startTime));
    const overlapEnd = Math.min(options.endTimestamp, Number(schedule.endTime));
    if (overlapEnd <= overlapStart) continue;

    totalEmitted += (BigInt(schedule.rewardRate) * BigInt(overlapEnd - overlapStart)) / Q32;
  }

  return totalEmitted;
}
