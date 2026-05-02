import { ChainApi } from "@defillama/sdk";
import { Interface } from "ethers";
import axios from "axios";
import { PromisePool } from "@supercharge/promise-pool";
import {
  Chain,
  FetchOptions,
  FetchResultFees,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// References:
// - Fund/distributions: https://www.franklintempleton.com/investments/options/money-market-funds/products/29386/SINGLCLASS/franklin-on-chain-u-s-government-money-fund/FOBXX#distributions
// - Official Stellar issuer: https://horizon.stellar.org/accounts/GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5

const TOKENS: Partial<Record<Chain, string[]>> = {
  [CHAIN.ETHEREUM]: [
    "0x3DDc84940Ab509C11B20B76B466933f40b750dc9", // BENJI
    "0x90276e9d4A023b5229E0C2e9D4b2a83fe3A2b48c", // iBENJI
  ],
  [CHAIN.POLYGON]: ["0x408a634b8a8f0de729b48574a3a7ec3fe820b00a"],
  [CHAIN.ARBITRUM]: ["0xB9e4765BCE2609bC1949592059B17Ea72fEe6C6A"],
  [CHAIN.AVAX]: ["0xE08b4c1005603427420e64252a8b120cacE4D122"],
  [CHAIN.BASE]: ["0x60CfC2b186a4CF647486e42c42B11cC6D571d1E4"],
  [CHAIN.BSC]: ["0x3d0a2A3a30a43a2C1C4b92033609245E819ae6a6"], // iBENJI
  [CHAIN.STELLAR]: [
    "BENJI-GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5",
  ],
};

const DIVIDEND_DISTRIBUTED_EVENT =
  "event DividendDistributed(address indexed account, uint256 indexed date, int256 rate, uint256 price, uint256 shares, uint256 dividendCashAmount, uint256 dividendBasis, bool isNegativeYield)";
const TRANSFER_EVENT =
  "event Transfer(address indexed from, address indexed to, uint256 value)";
const ZERO_ADDRESS_TOPIC =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

const transferInterface = new Interface([TRANSFER_EVENT]);
const dividendInterface = new Interface([DIVIDEND_DISTRIBUTED_EVENT]);
const dividendTopic =
  dividendInterface.getEvent("DividendDistributed")!.topicHash;

const EXPENSE_LIMITATION_TIMESTAMP = 1754006400; // August 2025
const GROSS_EXPENSE_YEAR = 0.0026;
const NET_EXPENSE_YEAR = 0.002;

const STELLAR_HORIZON_URL = "https://horizon.stellar.org";
const STELLAR_ISSUER =
  "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5";
const STELLAR_ASSET_CODE = "BENJI";

const axiosGet = async (url: string, params?: Record<string, any>) => {
  for (let i = 0; i < 3; i++) {
    try {
      return await axios.get(url, { params });
    } catch (e) {
      if (i === 2) throw e;
      await new Promise((resolve) => setTimeout(resolve, 500 * (i + 1)));
    }
  }
  throw new Error("axios retry failed");
};

const stellarAUM = async (token: string): Promise<number> => {
  const stellarApi = `https://api.stellar.expert/explorer/public/asset/${token}`;
  const { data } = await axiosGet(stellarApi);
  const { supply, toml_info } = data;
  return supply / 10 ** toml_info.decimals;
};

const sumStellarDividendTx = async (txHash: string): Promise<number> => {
  const { data } = await axiosGet(
    `${STELLAR_HORIZON_URL}/transactions/${txHash}/operations`,
    { limit: 200 },
  );
  const operations = data?._embedded?.records ?? [];

  return operations.reduce((sum: number, op: any) => {
    const isBenji =
      op.asset_code === STELLAR_ASSET_CODE &&
      op.asset_issuer === STELLAR_ISSUER;
    const isIssuerPayment = op.type === "payment" && op.from === STELLAR_ISSUER;
    return sum + (isBenji && isIssuerPayment ? Number(op.amount ?? 0) : 0);
  }, 0);
};

const stellarOnchainDistributions = async (
  startTimestamp: number,
  endTimestamp: number,
): Promise<number> => {
  const dividendTxs: string[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < 200; page++) {
    const { data } = await axiosGet(
      `${STELLAR_HORIZON_URL}/accounts/${STELLAR_ISSUER}/transactions`,
      { order: "desc", limit: 200, cursor },
    );
    const txs = data?._embedded?.records ?? [];
    if (!txs.length) break;

    for (const tx of txs) {
      const txTimestamp = Math.floor(new Date(tx.created_at).getTime() / 1000);
      if (txTimestamp >= endTimestamp) continue;
      if (txTimestamp < startTimestamp) {
        page = Infinity;
        break;
      }
      if (String(tx.memo ?? "").startsWith("DIVR")) dividendTxs.push(tx.hash);
    }

    cursor = txs[txs.length - 1]?.paging_token;
    if (!cursor) break;
  }

  const { results: txYields } = await PromisePool.withConcurrency(10)
    .for(dividendTxs)
    .process(sumStellarDividendTx);

  return txYields.reduce((sum, amount) => sum + amount, 0);
};

const evmTokenData = async (
  tokens: string[],
  api: ChainApi,
): Promise<Record<string, number>> => {
  const [decimals, supplies] = await Promise.all([
    api.multiCall({ calls: tokens, abi: "erc20:decimals" }),
    api.multiCall({ calls: tokens, abi: "erc20:totalSupply" }),
  ]);

  return tokens.reduce((acc, token, index) => {
    const tokenDecimals = Number(decimals[index]);
    acc[token.toLowerCase()] = tokenDecimals;
    acc.supply += Number(supplies[index]) / 10 ** tokenDecimals;
    return acc;
  }, { supply: 0 } as Record<string, number>);
};

const evmOnchainDistributions = async (
  getLogs: FetchOptions["getLogs"],
  tokenDecimals: Record<string, number>,
): Promise<number> => {
  const [mintLogs, dividendLogs] = await Promise.all([
    getLogs({
      targets: Object.keys(tokenDecimals),
      eventAbi: TRANSFER_EVENT,
      entireLog: true,
    }),
    getLogs({
      noTarget: true,
      topics: [dividendTopic],
      entireLog: true,
    }),
  ]);

  const dividendMintLogs = mintLogs.filter((log) => {
    const from = log.topics?.[1]?.toLowerCase();
    return from === ZERO_ADDRESS_TOPIC;
  });

  const dividendTxs = new Set(
    dividendLogs
      .map((log) => log.transactionHash ?? log.transaction_hash)
      .filter(Boolean)
      .map((txHash) => txHash.toLowerCase()),
  );

  return dividendMintLogs.reduce((sum, log) => {
    const txHash = log.transactionHash ?? log.transaction_hash;
    if (!txHash || !dividendTxs.has(txHash.toLowerCase())) return sum;

    const parsed = transferInterface.parseLog({
      topics: log.topics,
      data: log.data,
    });

    const decimals = tokenDecimals[log.address.toLowerCase()];
    const amount = Number(parsed!.args.value) / 10 ** decimals;
    return sum + amount;
  }, 0);
};

const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
  const { api, chain, createBalances, endTimestamp, getLogs, startTimestamp } =
    options;
  const tokens = TOKENS[chain]!;
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();
  let supply: number = 0;
  const tokenDecimals: Record<string, number> = {};

  if (api.chain === CHAIN.STELLAR) supply = await stellarAUM(tokens[0]);
  else {
    const tokenData = await evmTokenData(tokens, api);
    supply = tokenData.supply;
    tokens.forEach((token) => {
      tokenDecimals[token.toLowerCase()] = tokenData[token.toLowerCase()];
    });
  }

  const expenseRatio =
    endTimestamp < EXPENSE_LIMITATION_TIMESTAMP
      ? NET_EXPENSE_YEAR
      : GROSS_EXPENSE_YEAR;
  const periodSeconds = endTimestamp - startTimestamp;
  const managementFees = (supply * expenseRatio * periodSeconds) / (365 * 86400);
  const assetYields =
    api.chain === CHAIN.STELLAR
      ? await stellarOnchainDistributions(startTimestamp, endTimestamp)
      : await evmOnchainDistributions(getLogs, tokenDecimals);

  dailyFees.addUSDValue(managementFees, METRIC.MANAGEMENT_FEES);
  dailyFees.addUSDValue(assetYields, METRIC.ASSETS_YIELDS);

  dailyRevenue.addUSDValue(managementFees, METRIC.MANAGEMENT_FEES);
  dailySupplySideRevenue.addUSDValue(assetYields, METRIC.ASSETS_YIELDS);

  return { dailyFees, dailyRevenue, dailySupplySideRevenue };
};

const chainConfig = (
  chain: Chain,
  start: string,
  runAtCurrTime = true,
): [Chain, { start: string; runAtCurrTime?: boolean }] => {
  return [chain, { start, ...(runAtCurrTime ? { runAtCurrTime: true } : {}) }];
};

const breakdownMethodology = {
  Fees: {
    [METRIC.MANAGEMENT_FEES]:
      "Annual fund expense ratio prorated over the fetch period and applied to BENJI shares outstanding.",
    [METRIC.ASSETS_YIELDS]:
      "BENJI/iBENJI distributions from on-chain dividend mint events on EVM chains and Stellar DIVR issuer payments.",
  },
  Revenue: {
    [METRIC.MANAGEMENT_FEES]:
      "Fund management fees retained by Franklin Templeton.",
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]:
      "BENJI/iBENJI distributions paid to fund shareholders as newly minted shares or issuer payments.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [
    chainConfig(CHAIN.ETHEREUM, "2025-01-01", false),
    chainConfig(CHAIN.POLYGON, "2023-10-04"),
    chainConfig(CHAIN.ARBITRUM, "2025-01-01"),
    chainConfig(CHAIN.AVAX, "2025-01-01"),
    chainConfig(CHAIN.BASE, "2025-01-01"),
    // chainConfig(CHAIN.BSC, "2025-01-01"),
    chainConfig(CHAIN.STELLAR, "2023-10-04"),
  ],
  methodology: {
    Fees:
      "BENJI distributions from token mint Transfer events in transactions that also emit DividendDistributed on EVM chains and Stellar BENJI issuer transactions with DIVR memos, plus fund-level expenses estimated from the published annual expense ratio.",
    Revenue:
      "Franklin Templeton fund expenses, estimated from the published annual expense ratio.",
    SupplySideRevenue:
      "BENJI distributions/newly minted fund shares distributed to holders, using token mint Transfer events in transactions that also emit DividendDistributed on EVM chains and Stellar BENJI issuer payments with DIVR memos.",
  },
  breakdownMethodology,
};

export default adapter;
