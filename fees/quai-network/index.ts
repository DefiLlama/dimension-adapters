import { Balances } from "@defillama/sdk";
import { Adapter, FetchOptions, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { sleep } from "../../utils/utils"

const getRavenMiningRewards = async (options: FetchOptions, dailyFees: Balances) => {
  const addresses = [
    "RXtpH2yp6AA6VvPVTuhCrqxYG7vCGEPMB5",
    "RRTcyuUrrzdgKH2ti9QxwpqLtsAeZq2jtT",
    "RMTUdg4fYvGPGzaxAPXJYzjk7fBX6JWinW",
    "RVMKX8LuTWs8Y9zMyL4rZQbp5KwWmJMFwk"];

  let dailyRavenMined = 0;

  for (const address of addresses) {
    let pageNum = 0, lastTxnTime = options.startTimestamp
    while (lastTxnTime >= options.startTimestamp) {
      const response = await fetchURL(`https://explorer.rvn.zelcore.io/api/txs?address=${address}&pageNum=${pageNum}`);
      for (const { isCoinBase, time, valueOut } of response.txs) {
        if (isCoinBase && time >= options.startTimestamp && time < options.endTimestamp)
          dailyRavenMined += valueOut;
        lastTxnTime = time;
      }

      if (response.txs.length === 0) break;

      pageNum++;
    }
    await sleep(2000);
  }
  dailyFees.addCGToken("ravencoin", dailyRavenMined);
}

const getLitecoinMiningRewards = async (options: FetchOptions, dailyFees: Balances) => {
  const address = "ltc1qlg96gqruz4vu5w86z6rpqxt6ugqxrljxzpvcu8";
  let dailyLitecoinMined = 0, lastTxnTime = options.startTimestamp, lastSeenTxn = "";

  while (lastTxnTime >= options.startTimestamp) {
    const response = await fetchURL(`https://litecoinspace.org/api/address/${address}/txs/chain/${lastSeenTxn}`);
    if (response.length === 0) break;

    for (const { txid, vin, vout, status } of response) {
      if (vin && vin.length > 0 && vin[0].is_coinbase && status.block_time >= options.startTimestamp && status.block_time < options.endTimestamp) {
        dailyLitecoinMined += (vout?.[0]?.value ?? 0) / 1e8;
      }
      lastSeenTxn = txid;
      lastTxnTime = status.block_time;
    }

  }
  dailyFees.addCGToken("litecoin", dailyLitecoinMined);
}

const getBchMiningRewards = async (options: FetchOptions, dailyFees: Balances) => {
  const address = "qqqea0a7ryny69sskvx857apy3r6wt6w35524nm4xw";
  let dailyBchMined = 0, lastTxnTime = options.startTimestamp, offset = 0;

  while (lastTxnTime >= options.startTimestamp) {
    const txs = await fetchURL(`https://api.blockchain.info/haskoin-store/bch/address/${address}/transactions?limit=100&offset=${offset}`);
    if (txs.length === 0) break;

    const txnDetails = await fetchURL(`https://api.blockchain.info/haskoin-store/bch/transactions?txids=${txs.map((tx: any) => tx.txid).join(',')}`);

    for (const { inputs, outputs, time } of txnDetails) {
      if (inputs && inputs.length > 0 && inputs[0].coinbase && time >= options.startTimestamp && time < options.endTimestamp) {
        dailyBchMined += (outputs?.[0]?.value ?? 0) / 1e8;
      }
      lastTxnTime = time;
    }
    offset += 100;
  }

  dailyFees.addCGToken("bitcoin-cash", dailyBchMined);
}

const getDogeMiningRewards = async (options: FetchOptions, dailyFees: Balances) => {
  const address = "D6rnVyuuHB3x8et741kmXzFuZSTVnJQDke"
  let pageNum = 1, dailyDogeMined = 0, lastTxnTime = options.startTimestamp;

  while (lastTxnTime >= options.startTimestamp) {
    const { transactionSummaries } = await fetchURL(`https://doge.firesat.io/api/v1/address/${address}?page=${pageNum}&limit=100`);

    if (transactionSummaries.length === 0) break;

    for (const { coinbase, time, received } of transactionSummaries) {
      if (coinbase && time >= options.startOfDay && time < options.endTimestamp)
        dailyDogeMined += +received;
      lastTxnTime = time;
    }
    pageNum++;
  }

  dailyFees.addCGToken("dogecoin", dailyDogeMined);
}

const chainDetails = {
  ltc: getLitecoinMiningRewards,
  doge: getDogeMiningRewards,
  rvn: getRavenMiningRewards,
  bch: getBchMiningRewards
};

const getQuaiBurnDetails = async (options: FetchOptions, dailyHoldersRevenue: Balances) => {
  const { fromApi, api } = options;
  const quaiBurnAddress = "0x0050AF0000000000000000000000000000000000";
  const tokens = ["0x0000000000000000000000000000000000000000",]; // Quai Native

  await api.sumTokens({ tokens, owner: quaiBurnAddress })
  await fromApi.sumTokens({ tokens, owner: quaiBurnAddress })

  dailyHoldersRevenue.addBalances(api.getBalancesV2())
  dailyHoldersRevenue.subtract(fromApi.getBalancesV2())
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
  Revenue: "Fees going to buyback and burn of quai token.",
  HoldersRevenue: "Fees going to buyback and burn of quai token",
}

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.QUAI],
  start: '2025-12-17',
  methodology,
};

export default adapter;
