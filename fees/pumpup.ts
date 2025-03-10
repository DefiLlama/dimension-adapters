import { sliceIntoChunks } from "@defillama/sdk/build/util";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryEvents } from "../helpers/sui";
import axios from "axios";

const UNIHOUSE_CORE_PACKAGE_ID =
  "0x2f2226a22ebeb7a0e63ea39551829b238589d981d1c6dd454f01fcc513035593";
const UNI_HOUSE_OBJ_ID =
  "0x75c63644536b1a7155d20d62d9f88bf794dc847ea296288ddaf306aa320168ab";

async function call(
  method: string,
  params: any,
  { withMetadata = false } = {}
) {
  if (!Array.isArray(params)) params = [params];
  const {
    data: { result },
  } = await axios.post("https://fullnode.mainnet.sui.io/", {
    jsonrpc: "2.0",
    id: 1,
    method,
    params,
  });

  return withMetadata ? result : result.data;
}

async function getCoinMetadata(coinType: string) {
  const result = await call("suix_getCoinMetadata", [coinType], {
    withMetadata: true,
  });
  return result;
}

async function getObjects(objectIds: string[]): Promise<any[]> {
  if (objectIds.length > 9) {
    const chunks = sliceIntoChunks(objectIds, 9);
    const res = [];
    for (const chunk of chunks) res.push(...(await getObjects(chunk)));
    return res;
  }

  const result = await call(
    "sui_multiGetObjects",
    [
      objectIds,
      {
        showType: true,
        showOwner: true,
        showContent: true,
      },
    ],
    { withMetadata: true }
  );

  return objectIds.map(
    (i: string) => result.find((j: any) => j.data.objectId === i)?.data?.content
  );
}

async function getDynamicFieldObjects({
  parent,
  cursor = null,
  limit = 48,
  items = [],
  idFilter = (i) => i,
  addedIds = new Set(),
}: {
  parent: string;
  cursor?: string | null;
  limit?: number;
  items?: any[];
  idFilter?: (i: any) => boolean;
  addedIds?: Set<string>;
}) {
  const { data, hasNextPage, nextCursor } = await call(
    "suix_getDynamicFields",
    [parent, cursor, limit],
    {
      withMetadata: true,
    }
  );
  const fetchIds = data
    .filter(idFilter)
    .map((i: any) => i.objectId)
    .filter((i: any) => !addedIds.has(i));
  fetchIds.forEach((i: any) => addedIds.add(i));
  const objects = await getObjects(fetchIds);
  items.push(...objects);
  if (!hasNextPage) return items;
  return getDynamicFieldObjects({
    parent,
    cursor: nextCursor,
    items,
    limit,
    idFilter,
    addedIds,
  });
}

const fetchFees = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  //Unihouse
  const unihouseDynamicFields = await getDynamicFieldObjects({
    parent: UNI_HOUSE_OBJ_ID,
  });

  const unihouseList = unihouseDynamicFields?.filter((field) =>
    field?.type.includes("house::House")
  );

  const unihouseIdList = unihouseList.map((house) => house.fields.id.id);

  const houseObjects = await getObjects(unihouseIdList);

  const houseTokenType = houseObjects
    .map((house) => house.type.split("<")[1].split(">")[0])
    .filter((type) => !type.includes("::unihouse::FeeTag"));

  for (const tokenType of houseTokenType) {
    const joinHouseEvents = await queryEvents({
      eventType: `${UNIHOUSE_CORE_PACKAGE_ID}::house::JoinHouseEvent<${tokenType}>`,
      options,
    });

    const splitHouseEvents = await queryEvents({
      eventType: `${UNIHOUSE_CORE_PACKAGE_ID}::house::SplitHouseEvent<${tokenType}>`,
      options,
    });

    const coinMetadata = await getCoinMetadata(tokenType);

    joinHouseEvents.map((ev) => {
      const symbol = coinMetadata.symbol.toLowerCase();
      const decimals = coinMetadata.decimals;
      dailyFees.addCGToken(symbol, ev.fee_taken / 10 ** decimals);
    });

    splitHouseEvents.map((ev) => {
      const symbol = coinMetadata.symbol.toLowerCase();
      const decimals = coinMetadata.decimals;
      dailyFees.addCGToken(symbol, -ev.fee_reimbursed_amount / 10 ** decimals);
    });
  }

  // PumpUp
  const pumpupEvents = await queryEvents({
    eventType:
      "0x3f2a0baf78f98087a04431f848008bad050cb5f4427059fa08eeefaa94d56cca::curve::Points",
    options,
  });
  pumpupEvents.map((ev) => dailyFees.addCGToken("sui", ev.amount / 1e9));

  return { dailyFees, dailyRevenue: dailyFees };
};

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetchFees,
      start: "2024-06-02",
    },
  },
  version: 2,
};
export default adapters;
