import {
  FetchOptions,
  FetchResultV2,
  FetchV2,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { APTOS_RPC, getResources, getVersionFromTimestamp, getAptosHeaders } from "../../helpers/aptos";
import { httpGet } from "../../utils/fetchURL";

const PHOTON_RESOURCES = "0x03f1afa81351354a6bd71fce4c0546fe07d4ec5551ef75f8578b2e1d98e15206";


const USERS_MODULE = "0xa427cb093515353a7bcdd7e9fa08aa6be021eabaee160c78845f469d5a830e97";
const USER_REGISTERED_EVENT_TYPE = `${USERS_MODULE}::PhotonUsersModule::UserRegisteredEvent`;

const CAMPAIGN_MODULE = "0xa65b211020a1583496fa5db5bbf38150d0ca40858962a2d991c3010d4301a4d5";
const ADMIN_STORE_TYPE = `${CAMPAIGN_MODULE}::PhotonCampaignManagerModule::AdminStore`;
const CAMPAIGN_STORE_EVENTS_TYPE = `${CAMPAIGN_MODULE}::PhotonCampaignManagerModule::CampaignStoreEvents`;

const LIMIT = 100;

const fetchNewUsersInVersionRange = async (
  fromVersion: number,
  toVersion: number,
): Promise<number> => {
  const headers = getAptosHeaders();
  let count = 0;
  let start = 0;

  while (true) {
    const url = `${APTOS_RPC}/v1/accounts/${USERS_MODULE}/events/${USER_REGISTERED_EVENT_TYPE}?start=${start}&limit=${LIMIT}`;
    const events: any[] = await httpGet(url, { headers }).catch(() => []);

    if (!events.length) break;

    for (const e of events) {
      const ver = Number(e.version);
      if (ver > toVersion) return count;
      if (ver >= fromVersion) count++;
    }

    const lastVer = Number(events[events.length - 1].version);
    if (lastVer > toVersion) break;

    start += events.length;
  }

  return count;
};

const fetchEventsInVersionRange = async (
  resourceAddr: string,
  creationNum: string,
  counter: number,
  fromVersion: number,
  toVersion: number,
): Promise<any[]> => {
  const result: any[] = [];
  const headers = getAptosHeaders();
  let end = counter;

  while (end > 0) {
    const start = Math.max(end - LIMIT, 0);
    const url = `${APTOS_RPC}/v1/accounts/${resourceAddr}/events/${creationNum}?start=${start}&limit=${LIMIT}`;
    const events: any[] = await httpGet(url, { headers });

    if (!events.length) break;

    for (const event of events) {
      const version = Number(event.version);
      if (version >= fromVersion && version <= toVersion) {
        result.push(event);
      }
    }

    const oldestVersion = Number(events[0].version);
    if (oldestVersion < fromVersion) break;

    end = start;
  }

  return result;
};

const fetch: FetchV2 = async ({
  fromTimestamp,
  toTimestamp,
}: FetchOptions): Promise<FetchResultV2> => {
  try {
    // Resolve resource_campaign_manager from AdminStore
    const adminResources = await getResources(PHOTON_RESOURCES);
    const adminStore = adminResources.find((r: any) => r.type === ADMIN_STORE_TYPE);
    if (!adminStore) return { dailyActiveUsers: 0, dailyTransactionsCount: 0 };

    const resourceAddr: string = adminStore.data.resource_campaign_manager;

    // Get tokens_earned_events handle from CampaignStoreEvents
    const campaignResources = await getResources(resourceAddr);
    const campaignStoreEvents = campaignResources.find(
      (r: any) => r.type === CAMPAIGN_STORE_EVENTS_TYPE,
    );
    if (!campaignStoreEvents) return { dailyActiveUsers: 0, dailyTransactionsCount: 0 };

    const tokensEarnedHandle = campaignStoreEvents.data.tokens_earned_events;
    const counter = Number(tokensEarnedHandle?.counter ?? 0);
    const creationNum: string | undefined = tokensEarnedHandle?.guid?.id?.creation_num;

    if (!creationNum || counter === 0) return { dailyActiveUsers: 0, dailyTransactionsCount: 0 };

    const [fromVersion, toVersion] = await Promise.all([
      getVersionFromTimestamp(new Date(fromTimestamp * 1000)),
      getVersionFromTimestamp(new Date(toTimestamp * 1000)),
    ]);

    const [campaignEvents, dailyNewUsers] = await Promise.all([
      fetchEventsInVersionRange(resourceAddr, creationNum, counter, fromVersion, toVersion),
      fetchNewUsersInVersionRange(fromVersion, toVersion),
    ]);

    const uniqueUsers = new Set(campaignEvents.map((e: any) => e.data.user));

    return {
      dailyActiveUsers: uniqueUsers.size,
      dailyTransactionsCount: campaignEvents.length,
      dailyNewUsers,
    };
  } catch (error) {
    console.error("Error in Photon fetch:", error);
    return { dailyActiveUsers: 0, dailyTransactionsCount: 0 };
  }
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: "2025-11-01",
      meta: {
        methodology: {
          ActiveUsers:
            "Distinct wallet addresses that earned tokens by participating in a Photon campaign on this day.",
          TransactionsCount:
            "Total number of campaign participation transactions on this day.",
          NewUsers:
            "Number of new wallet addresses registered in the Photon ecosystem on this day (UserRegisteredEvent).",
        },
      },
    },
  },
  version: 2,
};

export default adapter;
