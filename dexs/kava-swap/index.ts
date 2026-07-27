import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { CosmosChainMetricConfig, getBlockRangeForTimestamps } from "../../helpers/cosmosChainFees";
import fetchURL from "../../utils/fetchURL";

const config: CosmosChainMetricConfig = {
  chain: CHAIN.KAVA,
  rpcs: ["https://rpc.kava.io"],
  denoms: {},
};

const denomConfigs: Record<string, { cgToken: string; decimals: number }> = {
  ukava: { cgToken: "kava", decimals: 6 },
  busd: { cgToken: "binance-usd", decimals: 8 },
  xrpb: { cgToken: "ripple", decimals: 8 },
  bnb: { cgToken: "binancecoin", decimals: 8 },
  btcb: { cgToken: "bitcoin", decimals: 8 },
  "ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2": { cgToken: "cosmos", decimals: 6 },
  "ibc/0471F1C4E7AFD3F07702BEF6DC365268D64570F7C1FDC98EA6098DD6DE59817B": { cgToken: "osmosis", decimals: 6 },
  "ibc/799FDD409719A1122586A629AE8FCA17380351A51C1F47A80A1B8E7F2A491098": { cgToken: "akash-network", decimals: 6 },
};

const swapActions = [
  "/kava.swap.v1beta1.MsgSwapExactForTokens",
  "/kava.swap.v1beta1.MsgSwapForExactTokens",
];

const coinPattern = /^(\d+)(.+)$/;

async function getSwapTxs(action: string, fromBlock: number, toBlock: number): Promise<any[]> {
  const query = `message.action='${action}' AND tx.height>=${fromBlock} AND tx.height<=${toBlock}`;
  const txs: any[] = [];
  let page = 1;
  while (true) {
    const url = `${config.rpcs[0]}/tx_search?query=${encodeURIComponent('"' + query + '"')}&page=${page}&per_page=100&order_by=${encodeURIComponent('"asc"')}`;
    const res = await fetchURL(url);
    const result = res?.result ?? res;
    const pageTxs = result?.txs ?? [];
    txs.push(...pageTxs);
    if (!pageTxs.length || txs.length >= Number(result?.total_count ?? 0)) break;
    page++;
  }
  return txs;
}

function addLeg(balances: any, coin?: string): boolean {
  const match = coin ? coinPattern.exec(coin) : null;
  if (!match) return false;
  const denomConfig = denomConfigs[match[2]];
  if (!denomConfig) return false;
  balances.addCGToken(denomConfig.cgToken, Number(match[1]) / 10 ** denomConfig.decimals);
  return true;
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const { fromBlock, toBlock } = await getBlockRangeForTimestamps(config, options.startTimestamp, options.endTimestamp);

  for (const action of swapActions) {
    const txs = await getSwapTxs(action, fromBlock, toBlock);
    for (const tx of txs) {
      if (Number(tx?.tx_result?.code ?? 0) !== 0) continue;
      for (const event of tx?.tx_result?.events ?? []) {
        if (event?.type !== "swap_trade") continue;
        const input = event.attributes?.find((a: any) => a.key === "input")?.value;
        const output = event.attributes?.find((a: any) => a.key === "output")?.value;
        if (!addLeg(dailyVolume, input)) addLeg(dailyVolume, output);
      }
    }
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.KAVA],
  start: "2026-07-09",
  methodology: {
    Volume: "Sum of one side of every trade executed through the chain's native swap module, read from swap_trade events. The input side is counted when it has a reliable price, otherwise the equal-value output side is counted instead.",
  },
};

export default adapter;
