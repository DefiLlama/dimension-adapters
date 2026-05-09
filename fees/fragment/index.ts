import { FetchOptions, SimpleAdapter, FetchResult, Dependencies } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

/**
 * All Fragment wallet addresses from ton-labels (https://github.com/ton-studio/ton-labels).
 * Query: SELECT address FROM dune.ton_foundation.dataset_labels WHERE label = 'fragment'
 */
const FRAGMENT_ADDRESSES = [
  '0:E6F3D8824F46B1EFBAB9AFC684793428C55FED69B46A15A49BE69A29BC49E530',
  '0:5E69BEC3DFC448C32A5E81B37B619810CF00DB6FC41F30CC18F28B89737A8F97',
  '0:852443F8599FE6A5DA34FE43049AC4E0BEB3071BB2BFB56635EA9421287C283A',
  '0:408DA3B28B6C065A593E10391269BAAA9C5F8CAEBC0C69D9F0AABBAB2A99256B',
  '0:43512860D54980CF24D59868A30E679927FB1373C10964DB7500EDCDF690ABC4',
  '0:158136239ADB15DD59DF90C641F9EFD312CFEB8664F218F4C3E5FCE9D95E6C07',
  '0:68F3A076D3451A18FD41E05C71B4C020545D46B2757064E65825DED0C49BF02C',
  '0:80D78A35F955A14B679FAA887FF4CD5BFC0F43B4A4EEA2A7E6927F3701B273C2',
];

/**
 * Telegram-controlled wallets (label = 'telegram' in ton-labels). These send
 * operational funding to Fragment and receive returns. Excluded on both sides
 * to avoid counting internal Telegram <-> Fragment flows as user fees or payouts.
 */
const TELEGRAM_WALLETS = [
  '0:8C397C43F9FF0B49659B5D0A302B1A93AF7CCC63E5F5C0C4F25A9DC1F8B47AB3', // Telegram Treasury
  '0:2ECF5E47D591EB67FA6C56B02B6BB1DE6A530855E16AD3082EAA59859E8D5FDC', // Telegram Team
  '0:99DC29AD86155121C8B0CE9B75542D1714F06B3FA42F5472D97BF61DC78E9048', // Telegram operations deployer/funder (vesting & validator wallets)
];

async function fetch(_a: any, _b: any, options: FetchOptions): Promise<FetchResult> {
  // Workaround for dune indexing issue
  const now = Date.now()
  const tenHoursAgo = now - (10 * 60 * 60 * 1000)
  if ((options.toTimestamp * 1000) > tenHoursAgo) {
      console.log("End timestamp is less than 10 hours ago, skipping fetch due to dune indexing delay", new Date(options.toTimestamp * 1000).toISOString(), new Date(tenHoursAgo).toISOString())
      throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay")
  }

  const fragmentAddressList = FRAGMENT_ADDRESSES.map(a => `'${a}'`).join(', ');
  const telegramAddressList = TELEGRAM_WALLETS.map(a => `'${a}'`).join(', ');

  const query = `
    WITH fees AS (
      SELECT SUM(value / 1e9) AS ton_received
      FROM ton.messages
      WHERE direction = 'in'
        AND NOT bounced
        AND value > 0
        AND destination IN (${fragmentAddressList})
        AND source NOT IN (${fragmentAddressList})
        AND source NOT IN (${telegramAddressList})
        AND block_time >= from_unixtime(${options.fromTimestamp})
        AND block_time < from_unixtime(${options.toTimestamp})
    ),
    supply_side AS (
      SELECT SUM(value / 1e9) AS ton_sent
      FROM ton.messages
      WHERE direction = 'in'
        AND NOT bounced
        AND value > 0
        AND source IN (${fragmentAddressList})
        AND destination NOT IN (${fragmentAddressList})
        AND destination NOT IN (${telegramAddressList})
        AND block_time >= from_unixtime(${options.fromTimestamp})
        AND block_time < from_unixtime(${options.toTimestamp})
    )
    SELECT
      COALESCE(fees.ton_received, 0) AS ton_received,
      COALESCE(supply_side.ton_sent, 0) AS ton_sent
    FROM fees
    CROSS JOIN supply_side`;

  const queryResults = await queryDuneSql(options, query);

  if (!queryResults[0]) {
    throw new Error('Dune query returned no results');
  }

  if (queryResults[0].ton_received == null || queryResults[0].ton_sent == null) {
    throw new Error(`Unexpected Dune result shape: ${JSON.stringify(queryResults[0])}`);
  }

  const dailyFees = options.createBalances();
  dailyFees.addCGToken("the-open-network", queryResults[0].ton_received);

  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addCGToken("the-open-network", queryResults[0].ton_sent);

  const dailyRevenue = dailyFees.clone();
  dailyRevenue.subtract(dailySupplySideRevenue);

  return {
      dailyFees,
      dailyUserFees: dailyFees,
      dailyRevenue,
      dailyProtocolRevenue: dailyRevenue,
      dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: "All TON payments received by Fragment wallets, excluding Telegram-controlled wallet flows and inter-Fragment wallet transfers. Covers: Telegram Stars, Ads, Premium, Gift Market, Gateway, username auctions, and Telegram Gifts.",
  UserFees: "Same as Fees: TON payments made by users to Fragment wallets on TON.",
  Revenue: "Fees minus supply-side revenue. Note: Stars purchased via Apple Pay/Google Pay are settled off-chain but paid out on-chain, so on-chain revenue may understate actual revenue.",
  ProtocolRevenue: "Same as Revenue — all retained revenue goes to Telegram (Fragment operator).",
  SupplySideRevenue: "All TON paid out by Fragment wallets to external addresses, excluding Telegram-controlled wallet returns and inter-Fragment transfers. Primarily: bot developer rewards, channel owner rewards, and user Stars rewards."
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.TON],
  start: '2024-10-01',
  methodology,
  isExpensiveAdapter: true,
  allowNegativeValue: true, // Revenue can be negative when rewards exceed payments due to more onchain redeems of offchain purchased stars
  dependencies: [Dependencies.DUNE]
}

export default adapter;
