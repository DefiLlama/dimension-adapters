import { FetchOptions, FetchResultV2, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { APTOS_RPC, getResources, getVersionFromTimestamp } from "../../helpers/aptos";
import { httpGet } from "../../utils/fetchURL";
import { sleep } from "../../utils/utils";

const ADMIN_ADDRESS   = "0x03f1afa81351354a6bd71fce4c0546fe07d4ec5551ef75f8578b2e1d98e15206";
const CAMPAIGN_MODULE = "0xa65b211020a1583496fa5db5bbf38150d0ca40858962a2d991c3010d4301a4d5";

const ADMIN_STORE_TYPE           = `${CAMPAIGN_MODULE}::PhotonCampaignManagerModule::AdminStore`;
const CAMPAIGN_STORE_EVENTS_TYPE = `${CAMPAIGN_MODULE}::PhotonCampaignManagerModule::CampaignStoreEvents`;

const LIMIT = 25;
const MAX_RETRIES = 3;

const httpGetWithRetry = async (url: string): Promise<any> => {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await httpGet(url);
    } catch (e: any) {
      if (attempt === MAX_RETRIES - 1) throw e;
      await sleep(1000 * 2 ** attempt);
    }
  }
};

const fetchEventsInVersionRange = async (
  addr: string,
  creationNum: string,
  counter: number,
  fromVersion: number,
  toVersion: number,
): Promise<number> => {
  let count = 0;
  let end = counter;

  while (end > 0) {
    const start = Math.max(end - LIMIT, 0);
    const events: any[] = await httpGetWithRetry(
      `${APTOS_RPC}/v1/accounts/${addr}/events/${creationNum}?start=${start}&limit=${end - start}`,
    );

    if (!events.length) break;

    for (const e of events) {
      const ver = Number(e.version);
      if (ver >= fromVersion && ver <= toVersion) count++;
    }

    if (Number(events[0].version) < fromVersion) break;
    end = start;
  }

  return count;
};

const fetch: FetchV2 = async ({ fromTimestamp, toTimestamp }: FetchOptions): Promise<FetchResultV2> => {
  const [fromVersion, toVersion] = await Promise.all([
    getVersionFromTimestamp(new Date(fromTimestamp * 1000)),
    getVersionFromTimestamp(new Date(toTimestamp * 1000)),
  ]);

  const adminResources = await getResources(ADMIN_ADDRESS);
  const adminStore = adminResources.find((r: any) => r.type === ADMIN_STORE_TYPE);
  if (!adminStore) return { dailyNewUsers: 0, dailyTransactionsCount: 0 };

  const campaignResourceAddr: string = adminStore.data.resource_campaign_manager;

  const campaignResources = await getResources(campaignResourceAddr);
  const campaignStoreEvents = campaignResources.find((r: any) => r.type === CAMPAIGN_STORE_EVENTS_TYPE);
  if (!campaignStoreEvents) return { dailyNewUsers: 0, dailyTransactionsCount: 0 };

  const userHandle     = campaignStoreEvents.data.user_created_events;
  const campaignHandle = campaignStoreEvents.data.tokens_earned_events;

  const userCounter     = Number(userHandle?.counter ?? 0);
  const campaignCounter = Number(campaignHandle?.counter ?? 0);

  const userCreationNum: string     = userHandle?.guid?.id?.creation_num;
  const campaignCreationNum: string = campaignHandle?.guid?.id?.creation_num;
  const eventAddr: string           = campaignHandle?.guid?.id?.addr ?? campaignResourceAddr;

  const [dailyNewUsers, dailyTransactionsCount] = await Promise.all([
    userCreationNum && userCounter > 0
      ? fetchEventsInVersionRange(eventAddr, userCreationNum, userCounter, fromVersion, toVersion)
      : Promise.resolve(0),
    campaignCreationNum && campaignCounter > 0
      ? fetchEventsInVersionRange(eventAddr, campaignCreationNum, campaignCounter, fromVersion, toVersion)
      : Promise.resolve(0),
  ]);

  return { dailyNewUsers, dailyTransactionsCount };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: "2025-11-01",
      meta: {
        methodology: {
          NewUsers: "Number of new wallet addresses registered in the Photon ecosystem on that day.",
          DailyActiveUsers: "Total number of users who participated in campaign on that day.",
        },
      },
    },
  },
  version: 2,
};

export default adapter;
