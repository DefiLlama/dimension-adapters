import fetchURL from "../../utils/fetchURL";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { getResources, APTOS_PRC } from "../../helpers/aptops";
import { APTOS_PRC } from "../../helpers/aptops"; // Assuming this provides the Aptos RPC URL
import { httpGet } from "../../utils/fetchURL";

// Constants
const ACCOUNT =
  "0x9770fa9c725cbd97eb50b2be5f7416efdfd1f1554beb0750d4dae4c64e860da3";
const EVENT_TYPE =
  "0x9770fa9c725cbd97eb50b2be5f7416efdfd1f1554beb0750d4dae4c64e860da3::reserve::DistributeBorrowFeeEvent";
const LIMIT = 100;

// Utility function to convert Aptos timestamp to Unix time
const toUnixTime = (timestamp: string): number =>
  Number((Number(timestamp) / 1e6).toString().split(".")[0]);

// Function to fetch and log events
const fetchAndLogEvents = async () => {
  try {
    // Step 1: Fetch account resources to find event handles
    const resourcesUrl = `${APTOS_PRC}/v1/accounts/${ACCOUNT}/resources`;
    const resources = await httpGet(resourcesUrl);

    console.log(resources);
    for (const resource of resources) {
      if (
        JSON.stringify(resource.data).includes("distribute_borrow_fee_event")
      ) {
        console.log("MATCHED RESOURCE TYPE:", resource.type);
        console.log("FIELDS:", Object.keys(resource.data));
      }
    }
    // Filter for the event type we care about
    const eventResource = resources.find((r: any) => r.type === EVENT_TYPE);

    if (!eventResource) {
      console.log("No events found for the specified type.");
      return;
    }

    // Step 2: Extract event handle details
    const eventHandle = eventResource.data;
    const counter = eventHandle.counter || 0;
    const creationNum = eventHandle.guid?.id?.creation_num;

    if (!creationNum) {
      console.log("No event handle GUID found.");
      return;
    }

    console.log(
      `Found event handle with counter: ${counter}, creation_num: ${creationNum}`
    );

    // Step 3: Fetch events using the creation number
    let start = Math.max(counter - LIMIT, 0);
    const eventsUrl = `${APTOS_PRC}/v1/accounts/${ACCOUNT}/events/${creationNum}?start=${start}&limit=${LIMIT}`;
    const events = await httpGet(eventsUrl);

    if (!events.length) {
      console.log("No events fetched.");
      return;
    }

    // Step 4: Log event details with timestamps
    for (const event of events) {
      const version = event.version;
      const blockUrl = `${APTOS_PRC}/v1/blocks/by_version/${version}`;
      const block = await httpGet(blockUrl);
      const timestamp = toUnixTime(block.block_timestamp);

      console.log("Event:", {
        sequence_number: event.sequence_number,
        type: event.type,
        data: event.data,
        timestamp: new Date(timestamp * 1000).toISOString(),
        version: version,
      });
    }

    console.log(`Total events fetched: ${events.length}`);
  } catch (error) {
    console.error("Error fetching events:", error);
  }
};

// Run the function
fetchAndLogEvents();

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: "2022-10-20",
    },
  },
  version: 1,
};

export default adapter;
