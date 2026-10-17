import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { CosmosChainMetricConfig, getBlockRangeForTimestamps } from "../../helpers/cosmosChainFees";
import { METRIC } from "../../helpers/metrics";
import fetchURL from "../../utils/fetchURL";

// Dexter (Persistence DEX) vault: every swap goes through it and emits a `wasm-dexter-vault::swap` event
// carrying total_fee / protocol_fee in fee_asset
const VAULT = "persistence1k8re7jwz6rnnwrktnejdwkwnncte7ek7gt29gvnl3sdrg9mtnqkstujtpg";
const SWAP_EVENT = "wasm-dexter-vault::swap";

const config: CosmosChainMetricConfig = {
  chain: CHAIN.PERSISTENCE,
  rpcs: ["https://rpc.cosmos.directory/persistence", "https://persistence-rpc.polkachu.com"],
  denoms: {},
};

// denom traces resolved via /ibc/apps/transfer/v1/denoms/{hash} on persistence core-1
const denomConfigs: Record<string, { cgToken: string; decimals: number }> = {
  uxprt: { cgToken: "persistence", decimals: 6 },
  "stk/uxprt": { cgToken: "persistence-staked-xprt", decimals: 6 },
  "stk/uatom": { cgToken: "stkatom", decimals: 6 },
  "ibc/C8A74ABBE2AF892E15680D916A7C22130585CE5704F9B17A10F184A90D53BECA": { cgToken: "cosmos", decimals: 6 }, // uatom
  "ibc/B3792E4A62DF4A934EF2DF5968556DB56F5776ED25BDE11188A4F58A7DD406F0": { cgToken: "usd-coin", decimals: 6 }, // noble uusdc
  "ibc/C559977F5797BDC1D74C0836A10C379C991D664166CB60D776A83029852431B4": { cgToken: "tether", decimals: 6 }, // kava usdt
  "ibc/CCA9F9B22D39884C09975D45E1869B73A12B87080EE53CB44905CE2C422CA228": { cgToken: "wrapped-bitcoin", decimals: 8 }, // osmosis wbtc
  "ibc/A6E3AF63B3C906416A9AF7A556C59EA4BD50E617EFFE6299B99700CCB780E444": { cgToken: "pstake-finance", decimals: 18 }, // gravity PSTAKE
  "ibc/5D3B6445EA1D7064C4B1CCB588638589529556E1BCBADF13475021B42EA8C73B": { cgToken: "shade-protocol", decimals: 8 }, // secret SHD
};

async function getVaultTxs(fromBlock: number, toBlock: number): Promise<any[]> {
  const query = `execute._contract_address='${VAULT}' AND tx.height>=${fromBlock} AND tx.height<=${toBlock}`;
  const txs: any[] = [];
  let page = 1;
  while (true) {
    const url = `${config.rpcs[0]}/tx_search?query=${encodeURIComponent('"' + query + '"')}&page=${page}&per_page=100&order_by=${encodeURIComponent('"asc"')}`;
    const res = await fetchURL(url);
    if (res?.error || !Array.isArray(res?.result?.txs) || res?.result?.total_count === undefined)
      throw new Error(`dexter: bad tx_search response for blocks ${fromBlock}-${toBlock} page ${page}`);
    txs.push(...res.result.txs);
    if (txs.length >= Number(res.result.total_count) || !res.result.txs.length) break;
    page++;
  }
  return txs;
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const { fromBlock, toBlock } = await getBlockRangeForTimestamps(config, options.startTimestamp, options.endTimestamp);
  const txs = await getVaultTxs(fromBlock, toBlock);

  for (const tx of txs) {
    if (Number(tx?.tx_result?.code ?? 0) !== 0) continue;
    for (const event of tx?.tx_result?.events ?? []) {
      if (event?.type !== SWAP_EVENT) continue;
      const attrs: Record<string, string> = Object.fromEntries((event.attributes ?? []).map((a: any) => [a.key, a.value]));
      if (attrs._contract_address !== VAULT || !attrs.fee_asset) continue; // zero-fee swaps carry no fee_asset
      const denom = JSON.parse(attrs.fee_asset)?.native_token?.denom;
      const denomConfig = denomConfigs[denom];
      if (!denomConfig) continue;
      const scale = 10 ** denomConfig.decimals;
      const totalFee = Number(attrs.total_fee ?? 0) / scale;
      const protocolFee = Number(attrs.protocol_fee ?? 0) / scale;
      dailyFees.addCGToken(denomConfig.cgToken, totalFee, METRIC.SWAP_FEES);
      dailyRevenue.addCGToken(denomConfig.cgToken, protocolFee, METRIC.PROTOCOL_FEES);
      dailySupplySideRevenue.addCGToken(denomConfig.cgToken, totalFee - protocolFee, METRIC.LP_FEES);
    }
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.PERSISTENCE],
  start: "2023-03-27",
  methodology: {
    Fees: "Swap fees paid by traders, read from the total_fee of every swap event emitted by the Dexter vault contract.",
    Revenue: "Protocol share of swap fees (protocol_fee in the vault swap event), sent to the Dexter treasury.",
    ProtocolRevenue: "Protocol share of swap fees (protocol_fee in the vault swap event), sent to the Dexter treasury.",
    SupplySideRevenue: "Remaining swap fees kept by liquidity providers.",
  },
  breakdownMethodology: {
    Fees: { [METRIC.SWAP_FEES]: "total_fee of every vault swap event." },
    Revenue: { [METRIC.PROTOCOL_FEES]: "protocol_fee of every vault swap event." },
    ProtocolRevenue: { [METRIC.PROTOCOL_FEES]: "protocol_fee of every vault swap event." },
    SupplySideRevenue: { [METRIC.LP_FEES]: "total_fee minus protocol_fee of every vault swap event." },
  },
};

export default adapter;
