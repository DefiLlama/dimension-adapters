import * as sdk from "@defillama/sdk";
import ADDRESSES from "../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// mainnet-api.yuzu.finance (the backend app.yuzu.finance itself reads) answers 500 on /v1/pools and
// /v1/stats since 2026-11-13, so volume and fees are read from the CLMM's own SwapEvent instead.
const aptos = sdk.chains.aptos;

// CLMM package, VITE_APP_CLMM_CONTRACT_ADDRESS in the app.yuzu.finance bundle
const YUZU = "0x46566b4a16a1261ab400ab5b9067de84ba152b5eb4016b217187f2a2ca980c5a";
const SWAP_EVENT = `${YUZU}::liquidity_pool::SwapEvent`;
const PAGE_SIZE = 100;

// A swap is booked once, on a leg we can price: the bridged majors in coreAssets plus MOVE, whose
// fungible asset is 0xa. Swaps between two long-tail tokens are left out rather than priced.
const PRICED_TOKENS = new Set([...Object.values(ADDRESSES.move), "0xa"].map((a) => a.toLowerCase()));
const isPriced = (token: string) => PRICED_TOKENS.has(token.toLowerCase());

const SWAPS_QUERY = `query ($type: String!, $from: bigint!, $to: bigint!, $offset: Int!, $limit: Int!) {
  events(
    where: { indexed_type: { _eq: $type }, transaction_version: { _gt: $from, _lte: $to } }
    order_by: [{ transaction_version: asc }, { event_index: asc }]
    offset: $offset
    limit: $limit
  ) { data }
}`;

const fetch = async (options: FetchOptions) => {
  const { chain } = options;
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Last version at or before each bound, so the window holds versions (from, to]. Each lookup is a
  // binary search over block heights on the public fullnode, which rate limits hard, so one at a time.
  const fromVersion = await aptos.getVersionAtTimestamp({ chain, timestamp: options.startTimestamp });
  const toVersion = await aptos.getVersionAtTimestamp({ chain, timestamp: options.endTimestamp });

  // The indexer can trail the node; a window it has not reached yet would silently come back short.
  const { processor_status } = await aptos.indexerQuery({
    chain,
    query: `query { processor_status(where: { processor: { _eq: "events_processor" } }) { last_success_version } }`,
  });
  const indexedVersion = Number(processor_status?.[0]?.last_success_version);
  if (!(indexedVersion >= toVersion))
    throw new Error(`Movement events indexer is at version ${indexedVersion}, window ends at ${toVersion}`);

  const swaps: any[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { events } = await aptos.indexerQuery({
      chain,
      query: SWAPS_QUERY,
      variables: { type: SWAP_EVENT, from: fromVersion, to: toVersion, offset, limit: PAGE_SIZE },
    });
    swaps.push(...events.map((e: any) => e.data));
    if (events.length < PAGE_SIZE) break;
  }
  if (!swaps.length) return { dailyVolume, dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue: dailyRevenue };

  // Pool tokens are fixed at creation; the view returns pools in the order they were asked for.
  const pools = [...new Set(swaps.map((s) => s.pool))];
  const [views] = await aptos.view({ chain, function: `${YUZU}::liquidity_pool::get_pool_views_by_addresses`, args: [pools] });
  const poolTokens: Record<string, [string, string]> = {};
  pools.forEach((pool, i) => (poolTokens[pool] = [views[i].token_0, views[i].token_1]));

  // Protocol share of each swap fee, protocol_fee_rate / fee_scale (200000 / 1e6 = 20% since launch,
  // no SetProtocolFeeEvent has been emitted), read at the end of the window.
  const [[protocolFeeRate], [feeScale]] = await Promise.all(
    ["protocol_fee_rate", "fee_scale"].map((fn) => aptos.view({ chain, function: `${YUZU}::config::${fn}`, ledgerVersion: toVersion }))
  );
  const rate = BigInt(protocolFeeRate);
  const scale = BigInt(feeScale);

  for (const swap of swaps) {
    const [token0, token1] = poolTokens[swap.pool];
    const [tokenIn, tokenOut] = swap.zero_for_one ? [token0, token1] : [token1, token0];
    const amountIn = BigInt(swap.amount_in);
    const amountOut = BigInt(swap.amount_out);
    const feeIn = BigInt(swap.fee_amount); // charged in the input token, included in amount_in

    let token: string, volume: bigint, fee: bigint;
    if (isPriced(tokenIn)) {
      [token, volume, fee] = [tokenIn, amountIn, feeIn];
    } else if (isPriced(tokenOut)) {
      // fee restated in the output token at the swap's own execution price
      [token, volume, fee] = [tokenOut, amountOut, amountIn > feeIn ? (amountOut * feeIn) / (amountIn - feeIn) : 0n];
    } else {
      continue;
    }
    const protocolFee = (fee * rate) / scale;
    dailyVolume.add(token, volume.toString());
    dailyFees.add(token, fee.toString(), "Swap Fees");
    dailyRevenue.add(token, protocolFee.toString(), "Swap Fees To Protocol");
    dailySupplySideRevenue.add(token, (fee - protocolFee).toString(), "Swap Fees To LPs");
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue: dailyRevenue };
};

const methodology = {
  Volume: "Value of the token paid into each swap on Yuzu's concentrated-liquidity pools, counted once per swap. Swaps between two unpriced long-tail tokens are excluded.",
  Fees: "Swap fees paid by traders on every swap.",
  Revenue: "The 20% share of swap fees kept by Yuzu.",
  SupplySideRevenue: "The 80% share of swap fees earned by liquidity providers.",
  ProtocolRevenue: "The 20% share of swap fees sent to the Yuzu treasury.",
};

const breakdownMethodology = {
  Fees: {
    "Swap Fees": "Swap fees paid by traders, at each pool's fee tier.",
  },
  Revenue: {
    "Swap Fees To Protocol": "20% of swap fees, kept by the protocol.",
  },
  SupplySideRevenue: {
    "Swap Fees To LPs": "80% of swap fees, earned by liquidity providers.",
  },
  ProtocolRevenue: {
    "Swap Fees To Protocol": "20% of swap fees, sent to the Yuzu treasury.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.MOVE],
  start: "2025-03-09", // first CreatePoolEvent, block 34557
  methodology,
  breakdownMethodology,
};

export default adapter;
