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
  token: string;
  sender: string;
  type: string;
}

const config: Record<string, string> = {
  [CHAIN.APTOS]: "0x5a96fab415f43721a44c5a761ecfcccc3dae9c21f34313f0e594b49d8d4564f4",
  [CHAIN.POLYGON]: "0x9Df4C994d8d8c440d87da8BA94D355BB85706f51",
}

const POLYGON_USDT_ADDRESS = ADDRESSES.polygon.USDT

const ItemSoldEvent = "event ItemSoldV1(uint256 tokenId, uint256 quantity, uint256 totalPrice)";

const toUnixTime = (timestamp: string): number =>
  Math.floor(Number(timestamp) / 1e6);

/**
 * Fetch event data from a resource within a time window.
 */
const getEventData = async (
  resource: any,
  fromTimestamp: number,
  toTimestamp: number,
  chain: string,
): Promise<DepositFungible[]> => {
  const eventData: DepositFungible[] = [];
  const limit = 100;

  // Defensive check for nested properties
  const depositFungible = resource?.data?.deposit_fungible;
  if (!depositFungible) return [];

  const counter = depositFungible.counter ?? 0;
  const start = Math.max(counter - limit, 0);

  const creationNum = depositFungible.guid?.id?.creation_num;
  if (!creationNum) return [];

  const eventUrl = `${APTOS_PRC}/v1/accounts/${config[chain]}/events/${creationNum}?start=${start}&limit=${limit}`;

  const events: any[] = await fetchURL(eventUrl);
  if (!events.length) return [];

  // Find earliest event by sequence_number
  const earliest = events.reduce((min, e) =>
    Number(e.sequence_number) < Number(min.sequence_number) ? e : min,
  );

  // Fetch block info by version
  const blockInfo = await fetchURL(
    `${APTOS_PRC}/v1/blocks/by_version/${earliest.version}`,
  );

  const blockTimestamp = blockInfo?.block_timestamp;
  if (!blockTimestamp) return [];

  const eventTimestamp = toUnixTime(blockTimestamp);

  // Check if event timestamp is within range
  if (eventTimestamp >= fromTimestamp && eventTimestamp <= toTimestamp) {
    for (const e of events) {
      eventData.push({
        amount: e.data.amount,
        token: e.data.token,
        sender: e.data.sender,
        type: e.type,
      });
    }
  }

  return eventData;
};

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  // Fetch all account resources
  const resources = await getResources(config[options.chain]);

  // Filter relevant resources
  const relevantResources = resources.filter((resource) =>
    resource.type.includes("RevenueContractV2::RevenueEventHolder"),
  );

  // If no relevant resources, return empty volume
  if (relevantResources.length === 0) {
    return {
      dailyFees,
      dailyRevenue: dailyFees,
      dailyProtocolRevenue: dailyFees,
    };
  }

  // Fetch events from all relevant resources concurrently
  const eventsArrays = await Promise.all(
    relevantResources.map((resource) =>
      getEventData(resource, options.fromTimestamp, options.toTimestamp, options.chain),
    ),
  );
  // Flatten events array
  const allEvents = eventsArrays.flat();

  // Create balances object and aggregate amounts per token
  for (const event of allEvents) {
    dailyFees.add(event.token, event.amount);
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};


const fetchPolygonRevenue = async (options: FetchOptions) => {
  const data: any[] = await options.getLogs({
    target: config[options.chain],
    eventAbi: ItemSoldEvent,
  });

  const dailyFees = options.createBalances()

  for (const log of data) {
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
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: "2025-06-02",
      meta: { methodology },
    },
    [CHAIN.POLYGON]: {
      fetch: fetchPolygonRevenue,
      start: "2025-06-23",
      meta: { methodology },
    },
  },
};

export default adapter;
