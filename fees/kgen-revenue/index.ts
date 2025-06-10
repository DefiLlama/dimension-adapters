import {
  FetchOptions,
  FetchResultV2,
  FetchV2,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { APTOS_PRC, getResources } from "../../helpers/aptops";
import { httpGet } from "../../utils/fetchURL";

interface DepositFungible {
  amount: string;
  token: string;
  sender: string;
  type: string;
}

const KGEN_APTOS_ON_CHAIN_REVENUE_CONTRACT =
  "0x5a96fab415f43721a44c5a761ecfcccc3dae9c21f34313f0e594b49d8d4564f4";

const toUnixTime = (timestamp: string): number =>
  Math.floor(Number(timestamp) / 1e6);

/**
 * Fetches and aggregates volume for the given time window.
 */
const fetchVolume: FetchV2 = async ({
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
        dailyVolume: createBalances(),
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
    const dailyVolume = createBalances();
    for (const event of allEvents) {
      dailyVolume.add(event.token, event.amount);
    }
    return {
      dailyVolume,
      dailyRevenue: dailyVolume,
      dailyFees: 0,
    };
  } catch (error) {
    console.error("Error in fetchVolume:", error);
    return {
      dailyVolume: createBalances(),
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

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch: fetchVolume,
      start: "2025-06-02",
      meta: {
        methodology: {
          dailyVolume:
            "Volume is calculated by summing the token volume of all USDC token deposits on the protocol that day.",
          dailyRevenue:
            "Revenue is calculated by summing the token volume of all USDC token deposits on the protocol that day.",
        },
      },
    },
  },
  version: 2,
};

export default adapter;
