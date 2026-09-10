import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpPost } from "../utils/fetchURL";

const DANGO_GRAPH_URL = `https://api-mainnet.dango.zone/graphql`
const PERPS_CONTRACT = "0x90bc84df68d1aa59a857e04ed529e9a26edbea4f"

const query = `{
  queryApp(request: { 
    wasm_smart: { 
      contract: "${PERPS_CONTRACT}", 
      msg: { pair_states: { start_after: null, limit: 500 } } 
    } 
  })
  allPerpsPairStats {
    pairId
    currentPrice
  }
}`

async function fetch(options: FetchOptions) {
    // The vault takes the other side of every position, so long_oi == short_oi always: one
    // side is the one-sided total and a long/short split would report it twice.
    const openInterestAtEnd = options.createBalances();

    const response = await httpPost(DANGO_GRAPH_URL, { query });

    const pricesMap = new Map(response.data.allPerpsPairStats.map((p: any) => [p.pairId, p.currentPrice]));
    const pairStates = response.data.queryApp.wasm_smart;

    for (const pair of Object.keys(pairStates)) {
        openInterestAtEnd.addUSDValue(Number(pairStates[pair].long_oi) * Number(pricesMap.get(pair)));
    }

    return { openInterestAtEnd }
}

const adapter: SimpleAdapter = {
    version: 2,
    runAtCurrTime: true,
    chains: [CHAIN.DANGO],
    fetch,
    deadFrom: "2026-07-29",
}

export default adapter;