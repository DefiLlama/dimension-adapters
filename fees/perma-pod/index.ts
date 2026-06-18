import BigNumber from "bignumber.js";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";
import { httpGet } from "../../utils/fetchURL";

const ZIGCHAIN = "zigchain";
const ZIGCHAIN_LCD = "https://public-zigchain-lcd.numia.xyz";

const MARKETS = [
  {
    redBank: "zig1s3frrzltqaxvuzffvxg89uuad6nkcyqe3ucvrahynznaek3mhe4s75puyu",
    creditManager: "zig1jul327luptcp9vcl6x4ws9xh6c3seuzsmmzj8n6e6qqgdplrvnzsh4t3ky",
  },
  {
    redBank: "zig1smfzazs6eg86vz23p8t7dk3gr4nnwr5m40yae9cl2m7erx3rnm2sxecuyc",
    creditManager: "zig1dmum9xwyvewuy8knmqxtqqmwjxxt88mlquww972cq8zyc0562hpquy3u90",
  },
];

const CREDIT_MANAGER_LIQUIDATION_ACTIONS = [
  "liquidate_deposit",
  "liquidate_lend",
  "liquidate_astro_lp",
  "liquidate_vault/unlocked",
  "liquidate_vault/unlocking",
  "liquidate_vault/locked",
];

const LIQUIDATION_PROTOCOL_LABEL = "Liquidation Fees To Protocol";
const LIQUIDATION_LIQUIDATOR_LABEL = "Liquidation Fees To Liquidators";

type Market = {
  denom: string;
  debt_total_amount: string;
  borrow_index: string;
  reserve_factor: string;
};

type BlockInfo = {
  height: number;
  timestamp: number;
};

type TxResponse = {
  events?: {
    type: string;
    attributes?: {
      key: string;
      value: string;
    }[];
  }[];
};

const blockCache: Record<number, BlockInfo> = {};

function encodeQuery(data: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(data)).toString("base64");
}

async function queryContract({
  contract,
  data,
  height,
}: {
  contract: string;
  data: Record<string, unknown>;
  height?: number;
}) {
  const query = encodeURIComponent(encodeQuery(data));
  return httpGet(
    `${ZIGCHAIN_LCD}/cosmwasm/wasm/v1/contract/${contract}/smart/${query}`,
    height ? { headers: { "x-cosmos-block-height": String(height) } } : undefined
  );
}

async function getBlock(height: number): Promise<BlockInfo> {
  if (!blockCache[height]) {
    const res = await httpGet(`${ZIGCHAIN_LCD}/cosmos/base/tendermint/v1beta1/blocks/${height}`);
    blockCache[height] = {
      height,
      timestamp: Math.floor(new Date(res.block.header.time).getTime() / 1000),
    };
  }
  return blockCache[height];
}

async function getLatestBlock(): Promise<BlockInfo> {
  const res = await httpGet(`${ZIGCHAIN_LCD}/cosmos/base/tendermint/v1beta1/blocks/latest`);
  const height = Number(res.block.header.height);
  blockCache[height] = {
    height,
    timestamp: Math.floor(new Date(res.block.header.time).getTime() / 1000),
  };
  return blockCache[height];
}

async function getHeightAtOrBefore(timestamp: number) {
  const latest = await getLatestBlock();
  if (timestamp >= latest.timestamp) return latest.height;

  let low = 1;
  let high = latest.height;
  let best = latest.height;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const block = await getBlock(mid);

    if (block.timestamp <= timestamp) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}

async function getMarkets(redBank: string, height: number) {
  let startAfter: string | null = null;
  const pageLimit = 10;
  const allMarkets: Market[] = [];

  do {
    const markets = await queryContract({
      contract: redBank,
      height,
      data: { markets_v2: { limit: pageLimit, start_after: startAfter } },
    });

    const marketsData = markets.data?.data ?? markets.data ?? markets;
    allMarkets.push(...marketsData);

    if (marketsData.length === pageLimit) startAfter = marketsData[marketsData.length - 1].denom;
    else startAfter = null;
  } while (startAfter);

  return allMarkets;
}

async function getAllMarkets(height: number) {
  const markets = await Promise.all(MARKETS.map(({ redBank }) => getMarkets(redBank, height)));
  return markets.flat();
}

function parseCoin(coin: string) {
  const match = coin.match(/^(\d+)(.+)$/);
  if (!match) throw new Error(`Invalid coin string: ${coin}`);
  return {
    amount: new BigNumber(match[1]),
    denom: match[2],
  };
}

function getAttribute(attributes: { key: string; value: string }[], key: string) {
  return attributes.find((attribute) => attribute.key === key)?.value;
}

async function queryTxs(query: string) {
  const txs: TxResponse[] = [];
  const limit = 100;
  let offset = 0;

  do {
    const params = [
      `query=${encodeURIComponent(query)}`,
      `pagination.limit=${limit}`,
      `pagination.offset=${offset}`,
      "order_by=ORDER_BY_DESC",
    ].join("&");
    const res = await httpGet(`${ZIGCHAIN_LCD}/cosmos/tx/v1beta1/txs?${params}`);

    const page = res.tx_responses ?? [];
    txs.push(...page);
    if (page.length < limit) break;
    offset += limit;
  } while (true);

  return txs;
}

async function getLiquidationTxs(fromHeight: number, toHeight: number) {
  const queries = MARKETS.flatMap(({ redBank, creditManager }) => [
    `wasm._contract_address='${redBank}' AND wasm.action='liquidate' AND tx.height>=${fromHeight} AND tx.height<=${toHeight}`,
    ...CREDIT_MANAGER_LIQUIDATION_ACTIONS.map(
      (action) =>
        `wasm._contract_address='${creditManager}' AND wasm.action='${action}' AND tx.height>=${fromHeight} AND tx.height<=${toHeight}`
    ),
  ]);
  const results = await Promise.all(queries.map(queryTxs));
  return results.flat();
}

function addLiquidationEvent(
  attributes: { key: string; value: string }[],
  balances: {
    dailyFees: ReturnType<FetchOptions["createBalances"]>;
    dailySupplySideRevenue: ReturnType<FetchOptions["createBalances"]>;
    dailyProtocolRevenue: ReturnType<FetchOptions["createBalances"]>;
  }
) {
  const action = getAttribute(attributes, "action");
  const isRedBankLiquidation = action === "liquidate";
  const isCreditManagerLiquidation = CREDIT_MANAGER_LIQUIDATION_ACTIONS.includes(action ?? "");
  if (!isRedBankLiquidation && !isCreditManagerLiquidation) return;

  const collateral = isRedBankLiquidation
    ? {
        amount: new BigNumber(getAttribute(attributes, "collateral_amount") ?? "0"),
        denom: getAttribute(attributes, "collateral_denom") ?? "",
      }
    : parseCoin(getAttribute(attributes, "coin_liquidated") ?? "0");
  if (!collateral.denom || !collateral.amount.gt(0)) return;

  const debt = isRedBankLiquidation
    ? {
        amount: new BigNumber(getAttribute(attributes, "debt_amount") ?? "0"),
        denom: getAttribute(attributes, "debt_denom") ?? "",
      }
    : parseCoin(getAttribute(attributes, "coin_debt_repaid") ?? "0");

  const protocolFee = isRedBankLiquidation
    ? new BigNumber(getAttribute(attributes, "protocol_fee_amount") ?? "0")
    : parseCoin(getAttribute(attributes, "protocol_fee_coin") ?? "0").amount;

  const collateralPrice = new BigNumber(getAttribute(attributes, "collateral_price") ?? "0");
  const debtPrice = new BigNumber(getAttribute(attributes, "debt_price") ?? "0");
  if (!collateralPrice.gt(0) || !debtPrice.gte(0)) return;

  const fairCollateral = debt.amount.times(debtPrice).div(collateralPrice);
  const totalBonus = BigNumber.maximum(collateral.amount.minus(fairCollateral), protocolFee)
    .integerValue(BigNumber.ROUND_DOWN);
  if (!totalBonus.gt(0)) return;

  const supplySideRevenue = BigNumber.maximum(totalBonus.minus(protocolFee), 0)
    .integerValue(BigNumber.ROUND_DOWN);

  balances.dailyFees.add(collateral.denom, totalBonus.toString(), METRIC.LIQUIDATION_FEES);
  balances.dailySupplySideRevenue.add(
    collateral.denom,
    supplySideRevenue.toString(),
    LIQUIDATION_LIQUIDATOR_LABEL
  );
  balances.dailyProtocolRevenue.add(
    collateral.denom,
    protocolFee.integerValue(BigNumber.ROUND_DOWN).toString(),
    LIQUIDATION_PROTOCOL_LABEL
  );
}

async function addLiquidationFees(
  fromHeight: number,
  toHeight: number,
  balances: {
    dailyFees: ReturnType<FetchOptions["createBalances"]>;
    dailySupplySideRevenue: ReturnType<FetchOptions["createBalances"]>;
    dailyProtocolRevenue: ReturnType<FetchOptions["createBalances"]>;
  }
) {
  const txs = await getLiquidationTxs(fromHeight, toHeight);
  for (const tx of txs) {
    for (const event of tx.events ?? []) {
      if (!event.type.startsWith("wasm")) continue;
      addLiquidationEvent(event.attributes ?? [], balances);
    }
  }
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const [fromHeight, toHeight] = await Promise.all([
    getHeightAtOrBefore(options.fromTimestamp),
    getHeightAtOrBefore(options.toTimestamp),
  ]);

  const [marketsBefore, marketsAfter] = await Promise.all([
    getAllMarkets(fromHeight),
    getAllMarkets(toHeight),
  ]);

  const marketBeforeByDenom = new Map(marketsBefore.map((market) => [market.denom, market]));

  for (const marketAfter of marketsAfter) {
    const marketBefore = marketBeforeByDenom.get(marketAfter.denom);
    if (!marketBefore) continue;

    const borrowIndexBefore = new BigNumber(marketBefore.borrow_index);
    const borrowIndexAfter = new BigNumber(marketAfter.borrow_index);
    const indexGrowth = borrowIndexAfter.minus(borrowIndexBefore);
    if (!indexGrowth.gt(0)) continue;

    const borrowInterest = new BigNumber(marketBefore.debt_total_amount)
      .times(indexGrowth)
      .div(borrowIndexBefore)
      .integerValue(BigNumber.ROUND_DOWN);
    if (!borrowInterest.gt(0)) continue;

    const reserveFactor = new BigNumber(marketAfter.reserve_factor);
    const protocolRevenue = borrowInterest.times(reserveFactor).integerValue(BigNumber.ROUND_DOWN);
    const supplySideRevenue = borrowInterest.minus(protocolRevenue);

    dailyFees.add(marketAfter.denom, borrowInterest.toString(), METRIC.BORROW_INTEREST);
    dailySupplySideRevenue.add(marketAfter.denom, supplySideRevenue.toString(), "Borrow Interest To Lenders");
    dailyProtocolRevenue.add(marketAfter.denom, protocolRevenue.toString(), "Borrow Interest To Protocol");
  }

  await addLiquidationFees(fromHeight, toHeight, {
    dailyFees,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
  });

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  };
};

const methodology = {
  Fees: "Borrow interest accrued by Permapod markets and liquidation bonuses paid by liquidated accounts.",
  UserFees: "Borrow interest paid by borrowers and liquidation bonuses paid by liquidated accounts.",
  Revenue: "Reserve factor share of borrow interest plus protocol liquidation fees.",
  ProtocolRevenue: "Reserve factor share of borrow interest plus protocol liquidation fees.",
  SupplySideRevenue: "Borrow interest distributed to lenders and liquidation bonuses paid to liquidators.",
  HoldersRevenue: "No revenue is distributed to token holders.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: "All borrow interest accrued by borrowers across Permapod markets.",
    [METRIC.LIQUIDATION_FEES]: "Liquidation bonuses paid by liquidated accounts.",
  },
  UserFees: {
    [METRIC.BORROW_INTEREST]: "All borrow interest accrued by borrowers across Permapod markets.",
    [METRIC.LIQUIDATION_FEES]: "Liquidation bonuses paid by liquidated accounts.",
  },
  Revenue: {
    "Borrow Interest To Protocol": "Reserve factor portion of borrow interest retained by the protocol.",
    [LIQUIDATION_PROTOCOL_LABEL]: "Protocol liquidation fee sent to the rewards collector.",
  },
  ProtocolRevenue: {
    "Borrow Interest To Protocol": "Reserve factor portion of borrow interest retained by the protocol.",
    [LIQUIDATION_PROTOCOL_LABEL]: "Protocol liquidation fee sent to the rewards collector.",
  },
  SupplySideRevenue: {
    "Borrow Interest To Lenders": "Borrow interest distributed to lenders after the protocol reserve factor.",
    [LIQUIDATION_LIQUIDATOR_LABEL]: "Liquidation bonus retained by liquidators after the protocol liquidation fee.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [ZIGCHAIN]: {
      fetch,
      start: "2025-11-16",
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
