import { Balances } from "@defillama/sdk";
import { Adapter, FetchOptions, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL, { httpGet } from "../../utils/fetchURL";

const getRavenMiningRewards = async (options: FetchOptions, dailyFees: Balances) => {
  const address = "RXtpH2yp6AA6VvPVTuhCrqxYG7vCGEPMB5";
  let pageNum = 0, totalRaven = 0, lastTxnTime = options.startOfDay;

  while (lastTxnTime >= options.startOfDay) {
    const response = await fetchURL(`https://explorer.rvn.zelcore.io/api/txs?address=${address}&pageNum=${pageNum}`);
    for (const { isCoinBase, time, valueOut } of response.txs) {
      if (isCoinBase && time >= options.startOfDay && time < options.endTimestamp)
        totalRaven += valueOut;
      lastTxnTime = time;
    }
    pageNum++;
  }
  dailyFees.addCGToken("ravencoin", totalRaven);
}

const getLitecoinMiningRewards = async (options: FetchOptions, dailyFees: Balances) => {
  const address = "ltc1qlg96gqruz4vu5w86z6rpqxt6ugqxrljxzpvcu8";
  let totalLitecoin = 0, lastTxnTime = options.startOfDay, lastSeenTxn = "";

  while (lastTxnTime >= options.startOfDay) {
    const response = await fetchURL(`https://litecoinspace.org/api/address/${address}/txs/chain/${lastSeenTxn}`);

    for (const { txid, vin, vout, status } of response) {
      if (vin && vin.length > 0 && vin[0].is_coinbase && status.block_time >= options.startOfDay && status.block_time < options.endTimestamp) {
        totalLitecoin += (vout?.[0]?.value ?? 0) / 1e8;
      }
      lastSeenTxn = txid;
      lastTxnTime = status.block_time;
    }
  }
  dailyFees.addCGToken("litecoin", totalLitecoin);
}

const getBchMiningRewards = async (options: FetchOptions, dailyFees: Balances) => {
  const address = "qqqea0a7ryny69sskvx857apy3r6wt6w35524nm4xw";
  let totalBch = 0, lastTxnTime = options.startOfDay, offset = 0;

  while (lastTxnTime >= options.startOfDay) {
    const txs = await fetchURL(`https://api.blockchain.info/haskoin-store/bch/address/${address}/transactions?limit=100&offset=${offset}`);
    const txnDetails = await fetchURL(`https://api.blockchain.info/haskoin-store/bch/transactions?txids=${txs.map((tx: any) => tx.txid).join(',')}`);

    for (const { inputs, outputs, time } of txnDetails) {
      if (inputs && inputs.length > 0 && inputs[0].coinbase && time >= options.startOfDay && time < options.endTimestamp) {
        totalBch += (outputs?.[0]?.value ?? 0) / 1e8;
      }
      lastTxnTime = time;
    }
    offset += 100;
  }

  dailyFees.addCGToken("bitcoin-cash", totalBch);
}

const getDogeMiningRewards = async (options: FetchOptions, dailyFees: Balances) => {
  const address = "D6rnVyuuHB3x8et741kmXzFuZSTVnJQDke"
  let pageNum = 1, totalDoge = 0, lastTxnTime = options.startOfDay;

  while (lastTxnTime >= options.startOfDay) {
    const { transactionSummaries } = await fetchURL(`https://doge.firesat.io/api/v1/address/${address}?page=${pageNum}&limit=100`);
    for (const { coinbase, time, received } of transactionSummaries) {
      if (coinbase && time >= options.startOfDay && time < options.endTimestamp)
        totalDoge += +received;
      lastTxnTime = time;
    }
    pageNum++;
  }

  dailyFees.addCGToken("dogecoin", totalDoge);
}

const chainDetails = {
  ltc: getLitecoinMiningRewards,
  doge: getDogeMiningRewards,
  rvn: getRavenMiningRewards,
  bch: getBchMiningRewards
};

const getQuaiBurnDetails = async (options: FetchOptions, dailyHoldersRevenue: Balances) => {
  const quaiBurnAddress = "0x0050AF0000000000000000000000000000000000";
  let lastTxnTime = options.startOfDay, next_page_params = {}, totalQuaiBurnt = 0;

  while (next_page_params != null && lastTxnTime >= options.startOfDay) {
    const response = await httpGet(`https://quaiscan.io/api/v2/addresses/${quaiBurnAddress}/transactions?${Object.entries(next_page_params).map(([k, v]: any) => `${k}=${encodeURIComponent(v === null ? "null" : v)}`).join("&")}`, {
      headers: {
        "Accept": "application/json",
      }
    });
    for (const item of response.items) {
      lastTxnTime = Math.floor(+new Date(item.timestamp) / 1000);
      if (lastTxnTime >= options.startOfDay && lastTxnTime < options.endTimestamp)
        totalQuaiBurnt += +item.value / 1e18;
    }
    next_page_params = response.next_page_params;
  }
  dailyHoldersRevenue.addCGToken("quai-network", totalQuaiBurnt);
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  for (const [_chain, fun] of Object.entries(chainDetails)) {
    await fun(options, dailyFees)
  }

  await getQuaiBurnDetails(options, dailyHoldersRevenue);

  return {
    dailyFees,
    dailyRevenue: dailyHoldersRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees: "Block rewards and transaction fees earned from SOAP merged mining across Ravencoin (KAWPOW), Litecoin/Dogecoin (Scrypt), and Bitcoin Cash (SHA-256) chains. Values are calculated using the token price at the time each block was mined.",
  Revenue: "All the fees going to buyback and burn of quai token.",
  HoldersRevenue: "100% of revenue is used to buy back and burn QUAI tokens, benefiting token holders.",
}

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.QUAI],
  start: '2025-12-17',
  protocolType: ProtocolType.CHAIN,
  methodology,
};

export default adapter;
