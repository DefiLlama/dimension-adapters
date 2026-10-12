import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";
import { evmToTronAddress } from "@defillama/sdk/build/generalUtil";
import { ethers } from "ethers";

// deBridge DLN. An order is created on the source chain's DlnSource (CreatedOrder: give token and amount leave the chain) and
// filled on the destination chain's DlnDestination (FulfilledOrder: take token and actualFulfillAmount arrive).
// https://docs.debridge.finance/the-debridge-messaging-protocol/deployed-contracts
const DLN_SOURCE = "0xeF4fB24aD0916217251F553c0596F8Edc630EB66";
const DLN_DESTINATION = "0xE7351Fd770A37282b91D153Ee690B63579D6dd7f";
const ORDER = "(uint64 makerOrderNonce, bytes makerSrc, uint256 giveChainId, bytes giveTokenAddress, uint256 giveAmount, uint256 takeChainId, bytes takeTokenAddress, uint256 takeAmount, bytes receiverDst, bytes givePatchAuthoritySrc, bytes orderAuthorityAddressDst, bytes allowedTakerDst, bytes allowedCancelBeneficiarySrc, bytes externalCall)";
const CREATED = `event CreatedOrder(${ORDER} order, bytes32 orderId, bytes affiliateFee, uint256 nativeFixFee, uint256 percentFee, uint32 referralCode, bytes metadata)`;
const FULFILLED = `event FulfilledOrder(${ORDER} order, bytes32 orderId, uint256 actualFulfillAmount, address sender, address unlockAuthority)`;
// earlier DlnDestination versions, without actualFulfillAmount; filled exactly takeAmount
const FULFILLED_LEGACY = `event FulfilledOrder(${ORDER} order, bytes32 orderId, address sender, address unlockAuthority)`;

const EVM_CHAINS = [
  CHAIN.ETHEREUM, CHAIN.BSC, CHAIN.POLYGON, CHAIN.ARBITRUM, CHAIN.AVAX, CHAIN.FANTOM, CHAIN.LINEA, CHAIN.OPTIMISM, CHAIN.BASE,
  CHAIN.SONIC, CHAIN.PLASMA, CHAIN.PLUME, CHAIN.MONAD, CHAIN.ROBINHOOD, CHAIN.ARC,
];

const fetchEvm = async (options: FetchOptions) => {
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();
  const created = await options.getLogs({ target: DLN_SOURCE, eventAbi: CREATED });
  const fulfilled = await options.getLogs({ target: DLN_DESTINATION, eventAbi: FULFILLED });
  const fulfilledLegacy = await options.getLogs({ target: DLN_DESTINATION, eventAbi: FULFILLED_LEGACY });

  for (const log of created) dailyOutgoingVolume.add(String(log.order.giveTokenAddress).toLowerCase(), log.order.giveAmount);
  for (const log of fulfilled) dailyIncomingVolume.add(String(log.order.takeTokenAddress).toLowerCase(), log.actualFulfillAmount);
  for (const log of fulfilledLegacy) dailyIncomingVolume.add(String(log.order.takeTokenAddress).toLowerCase(), log.order.takeAmount);

  return {
    dailyOutgoingVolume, dailyIncomingVolume,
    dailyOutgoingTxCount: created.length, dailyIncomingTxCount: fulfilled.length + fulfilledLegacy.length,
  };
};

const fetchTron = async (options: FetchOptions) => {
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();
  const iface = new ethers.Interface([CREATED, FULFILLED, FULFILLED_LEGACY]);
  // event fragments keep the order above: created, fulfilled, fulfilled (legacy)
  const [createdTopic, fulfilledTopic, legacyTopic] = iface.fragments.filter((f) => f.type === "event").map((f) => (f as ethers.EventFragment).topicHash);
  const rows: { topic0: string; topic1: string | null; topic2: string | null; topic3: string | null; data: string }[] = await queryAllium(`
    select topic0, topic1, topic2, topic3, data
    from tron.raw.logs
    where block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      and block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
      and topic0 in ('${createdTopic}', '${fulfilledTopic}', '${legacyTopic}')
  `);
  // token bytes are hex EVM-format addresses; tron prices are keyed by base58, the zero address stays native
  const tronToken = (bytes: string) => /^0x0{40}$/i.test(bytes) ? bytes : evmToTronAddress(bytes);

  let dailyOutgoingTxCount = 0;
  let dailyIncomingTxCount = 0;
  for (const row of rows) {
    const parsed = iface.parseLog({ topics: [row.topic0, row.topic1, row.topic2, row.topic3].filter(Boolean) as string[], data: row.data });
    if (!parsed) continue;
    if (parsed.topic === createdTopic) {
      dailyOutgoingVolume.add(tronToken(parsed.args.order.giveTokenAddress), parsed.args.order.giveAmount);
      dailyOutgoingTxCount++;
    } else {
      const amount = parsed.topic === fulfilledTopic ? parsed.args.actualFulfillAmount : parsed.args.order.takeAmount;
      dailyIncomingVolume.add(tronToken(parsed.args.order.takeTokenAddress), amount);
      dailyIncomingTxCount++;
    }
  }
  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount, dailyIncomingTxCount };
};

const fetchSolana = async (options: FetchOptions) => {
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();
  const rows: { direction: string; token: string; amount: string; txs: number }[] = await queryAllium(`
    select direction, token_in_address as token, sum(try_cast(token_in_amount_raw as numeric(38, 0)))::varchar as amount, count(*) as txs
    from crosschain.bridges.transfers
    where protocol = 'debridge' and chain = 'solana'
      and block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      and block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
      and token_in_address is not null
    group by direction, token_in_address
  `);
  // DLN has Solana orders every hour, so no rows means the table has not caught up
  if (!rows.length) throw new Error(`debridge: Allium returned no Solana rows for ${options.startTimestamp}, table not caught up`);

  let dailyOutgoingTxCount = 0;
  let dailyIncomingTxCount = 0;
  for (const row of rows) {
    if (row.direction === "outbound") {
      dailyOutgoingVolume.add(row.token, row.amount);
      dailyOutgoingTxCount += Number(row.txs);
    } else if (row.direction === "inbound") {
      dailyIncomingVolume.add(row.token, row.amount);
      dailyIncomingTxCount += Number(row.txs);
    }
  }
  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount, dailyIncomingTxCount };
};

const fetch = (options: FetchOptions) => {
  if (options.chain === CHAIN.SOLANA) return fetchSolana(options);
  if (options.chain === CHAIN.TRON) return fetchTron(options);
  return fetchEvm(options);
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [...EVM_CHAINS, CHAIN.TRON, CHAIN.SOLANA],
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    OutgoingVolume: "Value of tokens committed to deBridge DLN orders created on each chain.",
    IncomingVolume: "Value of tokens delivered to recipients by filled deBridge DLN orders on each chain.",
    OutgoingTxCount: "Number of deBridge DLN orders created on each chain.",
    IncomingTxCount: "Number of deBridge DLN orders filled on each chain.",
  },
};

export default adapter;
