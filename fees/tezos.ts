import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const TZKT_API = "https://api.tzkt.io/v1";
const MUTEZ_PER_XTZ = 1e6;
const ONE_DAY = 24 * 60 * 60;
const BLOCK_PAGE_SIZE = 10_000;

function getDayStartIso(timestamp: number) {
  return `${new Date(timestamp * 1000).toISOString().slice(0, 10)}T00:00:00Z`;
}

function getDayStartTimestamp(timestamp: number) {
  return Date.parse(getDayStartIso(timestamp)) / 1000;
}

async function getDailyBlockFees(startOfDay: number) {
  const start = getDayStartIso(startOfDay);
  const end = getDayStartIso(startOfDay + ONE_DAY);
  let offset = 0;
  let totalFees = 0;

  while (true) {
    const fees = await httpGet(
      `${TZKT_API}/blocks?timestamp.ge=${start}&timestamp.lt=${end}&select=fees&limit=${BLOCK_PAGE_SIZE}&offset=${offset}`
    );

    if (!Array.isArray(fees)) throw new Error("TzKT blocks response is not an array");

    fees.forEach((fee) => {
      const value = Number(fee);
      if (!Number.isFinite(value)) throw new Error(`Invalid Tezos block fee: ${fee}`);
      totalFees += value;
    });

    if (fees.length < BLOCK_PAGE_SIZE) break;
    offset += BLOCK_PAGE_SIZE;
  }

  return totalFees;
}

async function getDailyBurnedSupply(startOfDay: number) {
  const previousDay = getDayStartIso(startOfDay - ONE_DAY);
  const currentDay = getDayStartIso(startOfDay);

  const snapshots = await httpGet(
    `${TZKT_API}/statistics/daily?date.in=${previousDay},${currentDay}&select=date,totalBurned&sort.asc=date`
  );

  if (!Array.isArray(snapshots)) throw new Error("TzKT statistics response is not an array");

  const previous = snapshots.find(({ date }: any) => date === previousDay)?.totalBurned ?? 0;
  const current = snapshots.find(({ date }: any) => date === currentDay)?.totalBurned;

  if (current === undefined) throw new Error(`Missing Tezos burn snapshot for ${currentDay}`);

  const burned = Number(current) - Number(previous);
  if (!Number.isFinite(burned)) throw new Error(`Invalid Tezos burned supply for ${currentDay}`);

  return Math.max(burned, 0);
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const targetDay = getDayStartTimestamp(options.startTimestamp);
  const dailyBlockFees = await getDailyBlockFees(targetDay);
  const dailyBurnedSupply = await getDailyBurnedSupply(targetDay);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  dailyFees.addCGToken('tezos', (dailyBlockFees + dailyBurnedSupply) / MUTEZ_PER_XTZ);
  dailyRevenue.addCGToken('tezos', dailyBurnedSupply / MUTEZ_PER_XTZ);

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue: dailyRevenue,
  };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.TEZOS],
  start: '2018-06-30', // Tezos mainnet launch date
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: 'Total transaction fees paid by users for gas + storage fees',
    Revenue: 'Amount of tez burned, including storage fees, allocation fees, double baking/attestation punishments, etc.',
    HoldersRevenue: 'Amount of tez burned, including storage fees, allocation fees, double baking/attestation punishments, etc.'
  }
};

export default adapter;
