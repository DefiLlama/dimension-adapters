import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getWalletTransfers } from "../helpers/bridges";
import { queryClickhouse } from "../helpers/indexer";

// MeMeBridge, a maker bridge: users send tokens to the maker wallet on the source chain and the maker pays out from the
// same wallet on the destination chain, so value into the maker is outgoing and value out of it is incoming.
// Native coin moves are plain transactions, read from the indexer's transactions table (deposits carry a routing code in
// their input data, so every successful transaction to the maker counts); ERC20 moves are Transfer events.
// https://memebridge.xyz
const MAKER = "0x623777cc098c6058a46cf7530f45150ff6a8459d";
const NULL_ADDRESS = ADDRESSES.null;

const NATIVE_TXS = `
  SELECT lower(from_address) AS from_address, lower(to_address) AS to_address, toString(value) AS amount
  FROM evm_indexer.transactions
  WHERE chain = {chainId:UInt64}
    AND block_number >= {fromBlock:UInt32} AND block_number <= {toBlock:UInt32}
    AND status = 'success' AND value > 0
    AND (lower(to_address) = {maker:String} OR lower(from_address) = {maker:String})
`;

const fetch = async (options: FetchOptions) => {
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();
  let dailyOutgoingTxCount = 0;
  let dailyIncomingTxCount = 0;

  const [fromBlock, toBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()]);
  const nativeTxs = await queryClickhouse<{ from_address: string; to_address: string; amount: string }>(
    NATIVE_TXS, { chainId: Number(options.api.chainId), fromBlock, toBlock, maker: MAKER }, undefined, { chain: options.chain },
  );
  for (const tx of nativeTxs) {
    if (tx.from_address === tx.to_address) continue;
    if (tx.to_address === MAKER) {
      dailyOutgoingVolume.addGasToken(tx.amount);
      dailyOutgoingTxCount++;
    } else {
      dailyIncomingVolume.addGasToken(tx.amount);
      dailyIncomingTxCount++;
    }
  }

  // skip mints to and burns from the maker, and maker-to-maker transfers (returned by both queries)
  const notUser = new Set([MAKER, NULL_ADDRESS]);
  for (const row of await getWalletTransfers(options, { wallets: [MAKER] }, "in")) {
    if (notUser.has(row.from_address.toLowerCase())) continue;
    dailyOutgoingVolume.add(row.token, row.value);
    dailyOutgoingTxCount++;
  }
  for (const row of await getWalletTransfers(options, { wallets: [MAKER] }, "out")) {
    if (notUser.has(row.to_address.toLowerCase())) continue;
    dailyIncomingVolume.add(row.token, row.value);
    dailyIncomingTxCount++;
  }

  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount, dailyIncomingTxCount };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM, CHAIN.ARBITRUM, CHAIN.LINEA, CHAIN.OP_BNB, CHAIN.BLAST, CHAIN.POLYGON],
  start: "2024-07-03", // first day the old bridges server recorded MeMeBridge volume
  methodology: {
    OutgoingVolume: "Value of ETH and tokens sent to MeMeBridge's maker wallet on each chain to be bridged out.",
    IncomingVolume: "Value of ETH and tokens paid out by MeMeBridge's maker wallet on each chain to bridged-in users.",
    OutgoingTxCount: "Number of transfers to MeMeBridge's maker wallet on each chain.",
    IncomingTxCount: "Number of payouts from MeMeBridge's maker wallet on each chain.",
  },
};

export default adapter;
