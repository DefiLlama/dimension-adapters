import {
  FetchOptions,
  FetchResultV2,
  FetchV2,
  SimpleAdapter,
} from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { APTOS_PRC, getResources } from "../helpers/aptops";
import { httpGet } from "../utils/fetchURL";

interface DepositFungible {
  amount: string;
  token: string;
  sender: string;
  type: string;
}

const KGEN_APTOS_ON_CHAIN_REVENUE_CONTRACT =
  "0x5a96fab415f43721a44c5a761ecfcccc3dae9c21f34313f0e594b49d8d4564f4";
const ItemSoldEvent =
  "event ItemSoldV1(uint256  tokenId, uint256 quantity, uint256 totalPrice)";
const KGEN_POLYGON_ON_CHAIN_REVENUE_CONTRACT= "0x9Df4C994d8d8c440d87da8BA94D355BB85706f51";
const toUnixTime = (timestamp: string): number =>
  Math.floor(Number(timestamp) / 1e6);

const fetch: FetchV2 = async ({
  fromTimestamp,
  toTimestamp,
  createBalances,
}: FetchOptions): Promise<FetchResultV2> => {
  try {
    // Fetch all account resources
    const resources = await getResources(KGEN_APTOS_ON_CHAIN_REVENUE_CONTRACT);

    // Filter relevant resources
    const relevantResources = resources.filter((resource) =>
      resource.type.includes("RevenueContractV2::RevenueEventHolder"),
    );

    // If no relevant resources, return empty volume
    if (relevantResources.length === 0) {
      return {
        dailyRevenue: createBalances(),
        dailfyFees: createBalances(),
      };
    }

    // Fetch events from all relevant resources concurrently
    const eventsArrays = await Promise.all(
      relevantResources.map((resource) =>
        getEventData(resource, fromTimestamp, toTimestamp),
      ),
    );
    // Flatten events array
    const allEvents = eventsArrays.flat();

    // Create balances object and aggregate amounts per token
    const dailyFees = createBalances();
    for (const event of allEvents) {
      dailyFees.add(event.token, event.amount);
    }
    return {
      dailyRevenue: dailyFees,
      dailyFees: dailyFees,
    };
  } catch (error) {
    return {
      dailyRevenue: createBalances(),
      dailyFees: createBalances(),
    };
  }
};

/**
 * Fetch event data from a resource within a time window.
 */
const getEventData = async (
  resource: any,
  fromTimestamp: number,
  toTimestamp: number,
): Promise<DepositFungible[]> => {
  try {
    const eventData: DepositFungible[] = [];
    const limit = 100;

    // Defensive check for nested properties
    const depositFungible = resource?.data?.deposit_fungible;
    if (!depositFungible) return [];

    const counter = depositFungible.counter ?? 0;
    const start = Math.max(counter - limit, 0);

    const creationNum = depositFungible.guid?.id?.creation_num;
    if (!creationNum) return [];

    const eventUrl = `${APTOS_PRC}/v1/accounts/${KGEN_APTOS_ON_CHAIN_REVENUE_CONTRACT}/events/${creationNum}?start=${start}&limit=${limit}`;

    const events: any[] = await httpGet(eventUrl);
    if (!events.length) return [];

    // Find earliest event by sequence_number
    const earliest = events.reduce((min, e) =>
      Number(e.sequence_number) < Number(min.sequence_number) ? e : min,
    );

    // Fetch block info by version
    const blockInfo = await httpGet(
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
  } catch (err) {
    console.error("Error in getEventData:", err);
    return [];
  }
};


const fetchPolygonRevenue = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const data: any[] = await options.getLogs({
    target: KGEN_POLYGON_ON_CHAIN_REVENUE_CONTRACT,
    eventAbi: ItemSoldEvent,
  });

  for (const log of data) {
    const amount = Number(log.totalPrice);
    if (!isNaN(amount)) {
      dailyFees.addUSDValue(amount / 1e6); 
    }
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};
const meta = {

}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch: fetch,
      start: "2025-06-02",
      meta: {
        methodology: {
          Fees: "Fees accrued to the KGeN protocol from transaction fees on KStore, service charges, swaps, staking, and payments for Loyalty services.",
          Revenue: "Fees accrued to the KGeN protocol from transaction fees on KStore, service charges, swaps, staking, and payments for Loyalty services.",
        },
      },
    },
    [CHAIN.POLYGON]: {
      fetch: fetchPolygonRevenue,
      start: "2025-06-23",
      meta: {
        methodology: {
          Fees: "Fees accrued to the KGeN protocol from transaction fees on KStore, service charges, swaps, staking, and payments for Loyalty services.",
          Revenue: "Fees accrued to the KGeN protocol from transaction fees on KStore, service charges, swaps, staking, and payments for Loyalty services.",
        },
      },
    },
  },
  version: 2,
};

export default adapter;
