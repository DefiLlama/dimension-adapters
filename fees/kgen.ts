import ADDRESSES from '../helpers/coreAssets.json'
import {
  FetchOptions,
  FetchV2,
  SimpleAdapter,
} from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { APTOS_PRC, getResources } from "../helpers/aptops";
import fetchURL from "../utils/fetchURL";

interface DepositFungible {
  amount: string;
  token: string | null;
  sender: string;
  type: string;
}

const config: Record<string, string> = {
  [CHAIN.APTOS]: "0x5a96fab415f43721a44c5a761ecfcccc3dae9c21f34313f0e594b49d8d4564f4",
  [CHAIN.POLYGON]: "0x9Df4C994d8d8c440d87da8BA94D355BB85706f51",
}

const POLYGON_USDT_ADDRESS = ADDRESSES.polygon.USDT
const ItemSoldEvent = "event ItemSoldV1(uint256 tokenId, uint256 quantity, uint256 totalPrice)";
const PAGE_SIZE = 100;                        
const APT_DECIMALS = 1e8;                     
const toUnixTime = (timestamp: string): number =>
  Math.floor(Number(timestamp) / 1e6);

const version2tsCache: Record<string, number> = {};
async function versionToTimestamp(version: string): Promise<number> {
  if (version2tsCache[version] !== undefined) return version2tsCache[version];
  const block = await fetchURL(`${APTOS_PRC}/v1/blocks/by_version/${version}`);
  const ts = block?.block_timestamp ? toUnixTime(block.block_timestamp) : 0;
  version2tsCache[version] = ts;
  return ts;
}
async function getEventData(
  resource: any,
  fromTimestamp: number,
  toTimestamp: number,
  chain: string,
  eventKeys: string[] = ["deposit_fungible", "deposit_native"],
): Promise<DepositFungible[]> {

  const collected: DepositFungible[] = [];

  for (const key of eventKeys) {
    const handle = resource?.data?.[key];
    if (!handle) continue;

    const creationNum = handle.guid?.id?.creation_num;
    const totalEvents = Number(handle.counter ?? 0);
    if (!creationNum || totalEvents === 0) continue;

    for (let seq = totalEvents - 1; seq >= 0; seq -= PAGE_SIZE) {
      const batchStart = Math.max(seq - PAGE_SIZE + 1, 0);
      const url = `${APTOS_PRC}/v1/accounts/${config[chain]}/events/${creationNum}?start=${batchStart}&limit=${PAGE_SIZE}`;
      const events: any[] = await fetchURL(url);
      if (!events?.length) break;

      for (const e of events.reverse()) {
        const ts = await versionToTimestamp(e.version);
        if (ts > toTimestamp) continue;         
        if (ts < fromTimestamp) break;         

        collected.push({
          amount: e.data.amount,
          token: e.data?.token ?? null,
          sender: e.data?.sender,
          type: e.type,
        });
      }

      const firstTs = await versionToTimestamp(events[0].version);
      if (firstTs < fromTimestamp) break;
    }
  }

  return collected;
}

const fetchAptosRevenue: FetchV2 = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const resources = await getResources(config[options.chain]);

  const revHolders = resources.filter((resource) =>
    resource.type.includes("RevenueContractV2::RevenueEventHolder")
    || resource.type.includes("RevenueContractV2::RevenueEventHolderV1"));

  const eventArrays = await Promise.all(
    revHolders.map((r) =>
      getEventData(r, options.fromTimestamp, options.toTimestamp, options.chain))
  );

  for (const event of eventArrays.flat()) {
    if (event.token) {
      dailyFees.add(event.token, event.amount);
    } else {
      dailyFees.addCGToken("aptos", Number(event.amount) / APT_DECIMALS);
    }
  }

  return {
    dailyFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const fetchPolygonRevenue: FetchV2 = async (options: FetchOptions) => {
  const logs: any[] = await options.getLogs({
    target: config[options.chain],
    eventAbi: ItemSoldEvent,
  });

  const dailyFees = options.createBalances()

  for (const log of logs) {
    const amount = Number(log.totalPrice);
    if (!isNaN(amount)) {
      dailyFees.add(POLYGON_USDT_ADDRESS, amount);
    }
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Fees accrued to the KGeN protocol from transaction fees on KStore, service charges, swaps, staking, and payments for Loyalty services.",
  Revenue: "Fees accrued to the KGeN protocol from transaction fees on KStore, service charges, swaps, staking, and payments for Loyalty services.",
  ProtocolRevenue: "All fees collected by KGeN.",
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.APTOS]: {
      fetch: fetchAptosRevenue,
      start: "2025-06-02",
    },
    [CHAIN.POLYGON]: {
      fetch: fetchPolygonRevenue,
      start: "2025-06-23",
    },
  },
};

export default adapter;

