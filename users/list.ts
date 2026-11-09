import chains from "./chains"
import routers from "./routers/index"
import compoundV2 from "./compound-v2";
import alliumUsers from "./alliumUsers";
import duneUsers from "./duneUsers";
import tokenUsers from "./tokenUsers";
import { Adapter, FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { parseNewUserResponse, parseUserResponse } from "./utils/countUsers";
import { createFactoryExports } from "../factory/registry";

routers.concat(compoundV2 as any).forEach((item: any) => {
  item.activeUsersAdapter = getProtocolActiveUsersAdapter(item)
  item.newUsersAdapter = getProtocolNewUsersAdapter(item)
})

chains.forEach((item: any) => {
  if (item.getUsers)
    item.activeUsersAdapter = getChainActiveUsersAdapter(item)
  if (item.getNewUsers)
    item.newUsersAdapter = getChainNewUsersAdapter(item)
})

const activeUserProtocols: Record<string, SimpleAdapter> = {};
const newUserProtocols: Record<string, SimpleAdapter> = {};

routers.concat(chains as any[]).concat(compoundV2 as any[]).forEach((item: any) => {
  const id = item.id ?? item.name;
  if (item.activeUsersAdapter) activeUserProtocols[id] = item.activeUsersAdapter;
  if (item.newUsersAdapter) newUserProtocols[id] = item.newUsersAdapter;
})

alliumUsers.concat(duneUsers).concat(tokenUsers)
  .forEach(({ id, adapter }) => {
    if (activeUserProtocols[id]) throw new Error(`${id} has both a query-engine config and an address list, remove the address list entry`);
    activeUserProtocols[id] = adapter;
  })

export const { protocolList, getAdapter } = createFactoryExports(activeUserProtocols);
export const newUsers = createFactoryExports(newUserProtocols);



function getProtocolActiveUsersAdapter(item: typeof routers[0]): Adapter {

  async function prefetch({ startTimestamp, endTimestamp }: FetchOptions) {
    const data = await item.getUsers(startTimestamp, endTimestamp);
    return parseUserResponse(data, item.chains);
  }

  async function fetch({ chain, preFetchedResults, }: FetchOptions) {
    if (chain === CHAIN.CHAIN_GLOBAL)
      return {
        dailyActiveUsers: preFetchedResults?.all.users
      }

    return {
      dailyActiveUsers: preFetchedResults?.[chain]?.users,
      dailyTransactionsCount: preFetchedResults?.[chain]?.txs,
      dailyGasUsed: preFetchedResults?.[chain]?.gas,
    }
  }

  return {
    version: 1,
    chains: item.chains.concat([CHAIN.CHAIN_GLOBAL]),
    fetch: fetch as any,
    prefetch: prefetch as any,
    deadFrom: (item as any).deadFrom,
  }
}


function getProtocolNewUsersAdapter(item: typeof routers[0]): Adapter {

  async function prefetch({ startTimestamp, endTimestamp }: FetchOptions) {
    const data = await item.getNewUsers(startTimestamp, endTimestamp)
    return parseNewUserResponse(data)
  }

  async function fetch({ chain, preFetchedResults }: FetchOptions) {

    if (chain === CHAIN.CHAIN_GLOBAL)
      return {
        dailyNewUsers: preFetchedResults?.total
      }

    return {
      dailyNewUsers: preFetchedResults?.byChain?.[chain]?.users,
    }
  }

  return {
    version: 1,
    chains: item.chains.concat([CHAIN.CHAIN_GLOBAL]),
    fetch: fetch as any,
    prefetch: prefetch as any,
    deadFrom: (item as any).deadFrom,
  }
}


function getChainActiveUsersAdapter(item: typeof chains[0]): Adapter {

  async function fetch({ startTimestamp, endTimestamp, }: FetchOptions) {
    const [data] = await item.getUsers!(startTimestamp, endTimestamp);

    return {
      dailyActiveUsers: data?.usercount,
      dailyTransactionsCount: data?.txcount,
      dailyGasUsed: data?.gas,
    }
  }

  return {
    version: 1,
    chains: [item.chain],
    fetch: fetch as any,
    protocolType: ProtocolType.CHAIN,
    start: (item as any).start,
    deadFrom: (item as any).deadFrom,
  }
}


function getChainNewUsersAdapter(item: typeof chains[0]): Adapter {

  async function fetch({ startTimestamp, endTimestamp, }: FetchOptions) {
    const [data] = await item.getNewUsers!(startTimestamp, endTimestamp);

    return {
      dailyNewUsers: data?.usercount,
    }
  }

  return {
    version: 1,
    chains: [item.chain],
    fetch: fetch as any,
    protocolType: ProtocolType.CHAIN,
    start: (item as any).start,
    deadFrom: (item as any).deadFrom,
  }
}
