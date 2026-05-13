import chains from "./chains"
import routers from "./routers/index"
import compoundV2 from "./compound-v2";
import { Adapter, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { parseUserResponse } from "./utils/countUsers";
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
  if (item.activeUsersAdapter) activeUserProtocols[item.id ?? item.name] = item.activeUsersAdapter;
  if (item.newUsersAdapter) newUserProtocols[item.id ?? item.name] = item.newUsersAdapter;
})

export const { protocolList, getAdapter } = createFactoryExports(activeUserProtocols);
export const newUsers = createFactoryExports(newUserProtocols);



function getProtocolActiveUsersAdapter(item: typeof routers[0]): Adapter {

  async function prefetch({ startTimestamp, endTimestamp }: FetchOptions) {
    const data = await item.getUsers(startTimestamp, endTimestamp);
    return parseUserResponse(data, item.chains);
  }

  async function fetch(_: any, _1: any, { chain, preFetchedResults, createBalances }: FetchOptions) {
    if (chain === CHAIN.CHAIN_GLOBAL)
      return {
        dailyActiveUsers: preFetchedResults?.all.users
      }

    // `gas` is the per-chain total tx fee in wei (gas_price * gas_used summed in SQL).
    // Wrap it in a Balances object via addGasToken so the framework prices it through
    // the chain's native gas token instead of treating the raw quantity as USD.
    const gasWei = preFetchedResults?.[chain]?.gas
    const dailyGasUsed = createBalances()
    if (gasWei) dailyGasUsed.addGasToken(gasWei)

    return {
      dailyActiveUsers: preFetchedResults?.[chain]?.users,
      dailyTransactionsCount: preFetchedResults?.[chain]?.txs,
      dailyGasUsed,
    }
  }

  return {
    version: 1,
    chains: item.chains.concat([CHAIN.CHAIN_GLOBAL]),
    fetch: fetch as any,
    prefetch: prefetch as any,
  }
}


function getProtocolNewUsersAdapter(item: typeof routers[0]): Adapter {

  async function prefetch({ startTimestamp, endTimestamp }: FetchOptions) {
    const data = await item.getNewUsers(startTimestamp, endTimestamp)
    return data[0]
  }

  async function fetch(_: any, _1: any, { chain, preFetchedResults, }: FetchOptions) {

    if (chain === CHAIN.CHAIN_GLOBAL)
      return {
        dailyNewUsers: preFetchedResults?.user_count
      }

    return { // this is going to be empty as we don't have a breakdown of new users by chain
      dailyNewUsers: preFetchedResults?.[chain]?.users,
    }
  }

  return {
    version: 1,
    chains: item.chains.concat([CHAIN.CHAIN_GLOBAL]),
    fetch: fetch as any,
    prefetch: prefetch as any,
  }
}


function getChainActiveUsersAdapter(item: typeof chains[0]): Adapter {

  async function fetch(_: any, _1: any, { startTimestamp, endTimestamp, }: FetchOptions) {
    const [data] = await item.getUsers!(startTimestamp, endTimestamp);

    return {
      dailyActiveUsers: data?.usercount,
      dailyTransactionsCount: data?.txcount,
    }
  }

  return {
    version: 1,
    chains: [item.chain],
    fetch: fetch as any,
  }
}


function getChainNewUsersAdapter(item: typeof chains[0]): Adapter {

  async function fetch(_: any, _1: any, { startTimestamp, endTimestamp, }: FetchOptions) {
    const [data] = await item.getNewUsers!(startTimestamp, endTimestamp);

    return {
      dailyNewUsers: data?.usercount,
    }
  }

  return {
    version: 1,
    chains: [item.chain],
    fetch: fetch as any,
  }
}
