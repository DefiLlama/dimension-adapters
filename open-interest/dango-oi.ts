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
    const shortOpenInterestAtEnd = options.createBalances();
    const longOpenInterestAtEnd = options.createBalances();

    const response = await httpPost(DANGO_GRAPH_URL, { query });

    const pricesMap = new Map(response.data.allPerpsPairStats.map(p => [p.pairId, p.currentPrice]));
    const pairStates = response.data.queryApp.wasm_smart;

    for (const pair of Object.keys(pairStates)) {
        longOpenInterestAtEnd.addUSDValue(Number(pairStates[pair].long_oi) * Number(pricesMap.get(pair)));
        shortOpenInterestAtEnd.addUSDValue(Number(pairStates[pair].short_oi) * Number(pricesMap.get(pair)));
    }

    const openInterestAtEnd = longOpenInterestAtEnd.clone();
    openInterestAtEnd.add(shortOpenInterestAtEnd);

    return {
        shortOpenInterestAtEnd,
        longOpenInterestAtEnd,
        openInterestAtEnd,
    }
}

const adapter: SimpleAdapter = {
    version: 2,
    runAtCurrTime: true,
    chains: [CHAIN.DANGO],
    fetch,
}

export default adapter;