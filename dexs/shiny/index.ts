import ADDRESSES from '../../helpers/coreAssets.json'
import { Dependencies, SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";

// Each payment contract replaced the one before it and emits PaymentReceived once per paid
// order, so reading all of them over any window counts every order exactly once.
//   Base:     PaymentRouter (2026-01-20) -> ShinyOrders (2026-04-15) -> ShinyOrdersV2 (2026-06-10)
//   Abstract: PaymentRouter (2026-02-17) -> ShinyOrders (2026-04-15) -> ShinyOrdersV2 (2026-06-10)
const configs: any = {
  [CHAIN.BASE]: {
    start: '2026-01-20',
    SHINY_ORDERS: [
      '0x2F84B71ad6cC656C35316E728290eeb75cbAeD0F', // ShinyOrders
      '0x4d64FD7265064A1Ea64eC8863FDC8b8701665cf2', // ShinyOrdersV2
    ],
    PAYMENT_ROUTER: '0x9dB95986c6AbcF0eb8799EeF1c37E5c3C99f56D6',
    NFT: '0x911Dbdd9841B53eE5a08170109DAf7Ad82684108',
    USDC: ADDRESSES.base.USDC,
  },
  [CHAIN.ABSTRACT]: {
    start: '2026-01-20',
    SHINY_ORDERS: [
      '0x5c9CE8Be7Aa92fD089bE31B154be47a0e59d4282', // ShinyOrders
      '0x719fb3027f858Cf8E97074aEAC59DeAD1Ecfba21', // ShinyOrdersV2
    ],
    PAYMENT_ROUTER: '0xBb8c7575F798a82eF02B428aB4693dFfe258E266',
    NFT: '0x911Dbdd9841B53eE5a08170109DAf7Ad82684108',
    USDC: ADDRESSES.abstract.USDC,
  },
  [CHAIN.SOLANA]: {
    start: '2026-08-26',
  },
}

const PAYMENT_RECEIVED_V2 =
  "event PaymentReceived(uint256 indexed orderId, address indexed from, uint256 amount, uint256 timestamp, uint64 round)";
const PAYMENT_RECEIVED_V1 =
  "event PaymentReceived(uint256 indexed orderId, address indexed from, uint256 amount, uint256 timestamp)";
const TOKEN_SOLD_BACK =
  "event TokenSoldBack(uint256 indexed tokenId, address indexed seller, uint256 usdcAmount, string uuid)";
const TRANSFER =
  "event Transfer(address indexed from, address indexed to, uint256 value)";
// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
// indexed address args are left-padded to 32 bytes
const addressTopic = (address: string) => "0x000000000000000000000000" + address.slice(2).toLowerCase();

// EVM referral commissions are plain USDC transfers from Shiny's backend wallet, the same address
// that submits every ShinyOrdersV2 payOrderOnBehalf; referral payouts are the only USDC it sends.
// e.g. https://abscan.org/tx/0x344544d9b0315e50a2168d984f21ceb1f0f317a493bf8be984a35edf33113acc
const EVM_BACKEND_WALLET = '0x10120B5b8dE33F0eCcAfcAB6CDA74032A23d5419';

// Solana (Anchor programs). A pack payment is shiny_orders::pay_order_on_behalf, which moves the
// buyer's USDC into the treasury vault. Sellbacks leave the vault through shiny_treasury:
// backend_payout with category 2 pays for an unminted pull sold back, and authorized_transfer,
// invoked by shiny_nft when a minted card is burned, pays for a minted one. backend_payout with
// category 1 pays referral commissions. Other categories and skim_overflow (excess vault balance
// to Shiny's multisig) are not counted.
const SOLANA_ORDERS_PROGRAM = 'qSi3YBaG5hfd3c963AYL42Ni6j4ZxwYajeTxMFShiny';
const SOLANA_TREASURY_PROGRAM = 'W9uUoBaUe87NGD2CPqRQCsGwL7ruW4QgWD7bWMShiny';
const SOLANA_NFT_PROGRAM = 'xbFqWDDLkiDaBxdGkrfMFLZXmiZXm2xsPe8UN5Shiny';
// PDA that owns the treasury USDC vault 9RAyfwbbNiUbCW9H6GkPhRa8qKCMfSTW3eizGoWkzzyE
const SOLANA_VAULT_AUTHORITY = 'BLUg8cuP292HdFomNvc5xY4vJVVY45W5ozo5ThQMArBP';
// Anchor discriminator sha256("global:backend_payout")[0..8]; its args are amount u64,
// ledger_id u64, category u8, so the category is the last byte of the instruction data
const BACKEND_PAYOUT_DISCRIMINATOR = 'fee496303c8e76aa';
const REFERRAL_CATEGORY = '01';
const CASHOUT_CATEGORY = '02';

const LABEL_PACK_SALES = 'Pack Sales';
const LABEL_SELLBACKS = 'Card Sellback Payouts To Players';
const LABEL_REFERRALS = 'Referral Commissions To Referrers';
const LABEL_PROTOCOL_REVENUE = 'Pack Revenue To Treasury';

const getSolanaFlows = async (options: FetchOptions) => {
  const timeRange = (alias: string) =>
    `${alias}.block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND ${alias}.block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})`;

  const rows = await queryAllium(`
    WITH payout_ix AS (
      SELECT txn_id, instruction_index, RIGHT(i.data_hex, 2) AS category
      FROM solana.raw.instructions i
      WHERE i.program_id = '${SOLANA_TREASURY_PROGRAM}'
        AND i.stack_height = 1
        AND i.parent_tx_success = true
        AND i.data_hex_first16 = '${BACKEND_PAYOUT_DISCRIMINATOR}'
        AND RIGHT(i.data_hex, 2) IN ('${REFERRAL_CATEGORY}', '${CASHOUT_CATEGORY}')
        AND ${timeRange('i')}
    )
    SELECT
      CASE
        WHEN t.to_address = '${SOLANA_VAULT_AUTHORITY}' THEN 'pack_sales'
        WHEN c.category = '${REFERRAL_CATEGORY}' THEN 'referrals'
        ELSE 'sellbacks'
      END AS flow,
      SUM(t.raw_amount) AS amount
    FROM solana.assets.transfers t
    LEFT JOIN payout_ix c
      ON c.txn_id = t.txn_id AND c.instruction_index = t.instruction_index
    WHERE t.mint = '${ADDRESSES.solana.USDC}'
      AND ${timeRange('t')}
      AND (
        (t.to_address = '${SOLANA_VAULT_AUTHORITY}' AND t.outer_program_id = '${SOLANA_ORDERS_PROGRAM}')
        OR (t.from_address = '${SOLANA_VAULT_AUTHORITY}' AND t.outer_program_id = '${SOLANA_NFT_PROGRAM}')
        OR (t.from_address = '${SOLANA_VAULT_AUTHORITY}' AND t.outer_program_id = '${SOLANA_TREASURY_PROGRAM}' AND c.txn_id IS NOT NULL)
      )
    GROUP BY 1
  `);

  let totalSpend = 0n;
  let totalSellback = 0n;
  let totalReferral = 0n;
  for (const row of rows) {
    if (row.flow === 'pack_sales') totalSpend += BigInt(row.amount);
    else if (row.flow === 'referrals') totalReferral += BigInt(row.amount);
    else totalSellback += BigInt(row.amount);
  }
  return { totalSpend, totalSellback, totalReferral };
};

const getEvmFlows = async (options: FetchOptions) => {
  // Pack purchases via the current and previous ShinyOrders contracts
  const paymentsV2 = await options.getLogs({
    targets: configs[options.chain].SHINY_ORDERS,
    eventAbi: PAYMENT_RECEIVED_V2,
  });

  // Pack purchases via legacy contract (still has historical volume)
  const paymentsV1 = await options.getLogs({
    target: configs[options.chain].PAYMENT_ROUTER,
    eventAbi: PAYMENT_RECEIVED_V1,
  });

  // Sellbacks (NFT burned, USDC returned to user)
  const sellbacks = await options.getLogs({
    target: configs[options.chain].NFT,
    eventAbi: TOKEN_SOLD_BACK,
  });

  let totalSpend = 0n;
  let totalSellback = 0n;

  paymentsV2.forEach((log: any) => {
    totalSpend += BigInt(log.amount.toString());
  });
  paymentsV1.forEach((log: any) => {
    totalSpend += BigInt(log.amount.toString());
  });
  sellbacks.forEach((log: any) => {
    totalSellback += BigInt(log.usdcAmount.toString());
  });

  // Referral commissions paid from the backend wallet
  const referralPayouts = await options.getLogs({
    target: configs[options.chain].USDC,
    eventAbi: TRANSFER,
    topics: [TRANSFER_TOPIC, addressTopic(EVM_BACKEND_WALLET)],
  });

  let totalReferral = 0n;
  referralPayouts.forEach((log: any) => {
    totalReferral += BigInt(log.value.toString());
  });
  return { totalSpend, totalSellback, totalReferral };
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const isSolana = options.chain === CHAIN.SOLANA;
  const usdc = isSolana ? ADDRESSES.solana.USDC : configs[options.chain].USDC;
  const { totalSpend, totalSellback, totalReferral } = isSolana ? await getSolanaFlows(options) : await getEvmFlows(options);

  // Volume is pack purchases only. Sellback payouts are refunds, not trading volume.
  dailyVolume.add(usdc, totalSpend);

  // Fees = pack spend net of sellback payouts
  dailyFees.add(usdc, totalSpend, LABEL_PACK_SALES);
  dailyFees.subtractToken(usdc, totalSellback, LABEL_SELLBACKS);

  // Referral commissions are paid out of fees; revenue is what the protocol keeps after them
  dailySupplySideRevenue.add(usdc, totalReferral, LABEL_REFERRALS);
  const revenue = dailyFees.clone();
  revenue.subtract(dailySupplySideRevenue);
  const dailyRevenue = revenue.clone(1, LABEL_PROTOCOL_REVENUE);

  return {
    dailyVolume,
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Volume:
    "USDC players spend on gacha packs and pack battles. Card sellbacks paid to players are excluded.",
  Fees: "Pack and battle spend minus sellback payouts to players.",
  SupplySideRevenue: "Referral commissions paid to users whose referrals bought packs.",
  Revenue: "Fees minus referral commissions: what Shiny keeps from pack spend after sellback payouts and referral commissions.",
  ProtocolRevenue: "All revenue goes to the Shiny treasury.",
};

const feeBreakdown = {
  [LABEL_PACK_SALES]: "USDC players pay to open gacha packs and enter pack battles.",
  [LABEL_SELLBACKS]: "USDC paid back to players who sell pulled cards back to Shiny, subtracted from what the protocol keeps.",
};

const revenueBreakdown = {
  [LABEL_PROTOCOL_REVENUE]: "Pack and battle spend minus sellback payouts and referral commissions: what Shiny keeps in treasury.",
};

const adapter: SimpleAdapter = {
  version: 2,
  //pullHourly: true,
  fetch,
  adapter: configs,
  dependencies: [Dependencies.ALLIUM],
  methodology,
  breakdownMethodology: {
    Fees: feeBreakdown,
    SupplySideRevenue: {
      [LABEL_REFERRALS]: "USDC paid to referrers as commission on their referrals' pack spend.",
    },
    Revenue: revenueBreakdown,
    ProtocolRevenue: revenueBreakdown,
  },
  allowNegativeValue: true, // sellback payouts can exceed pack spend in the same hour
};

export default adapter;
