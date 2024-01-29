import BigNumber from "bignumber.js";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";
import { getBalance } from "@defillama/sdk/build/eth";
import { Adapter, ChainBlocks, FetchResultFees, ProtocolType } from "../adapters/types";
import postgres from "postgres";
import { getPrices } from "../utils/prices";
import { ethers } from "ethers";
import * as sdk from "@defillama/sdk";

const topic0 = "0xc8a211cc64b6ed1b50595a9fcb1932b6d1e5a6e8ef15b60e5b1f988ea9086bba";

async function getFees(toTimestamp: number, fromTimestamp: number, chainBlocks: ChainBlocks) {
  const todaysBlock = await getBlock(toTimestamp, CHAIN.MANTA, chainBlocks);
  const yesterdaysBlock = await getBlock(fromTimestamp, CHAIN.MANTA, {});

  const feeWallet = "0x4200000000000000000000000000000000000011";
  const l1FeeVault = "0x420000000000000000000000000000000000001a";
  const logsWithdrawal: ethers.EventLog[] = (
    await Promise.all(
      [feeWallet, l1FeeVault].map((address) =>
        sdk.getEventLogs({
          toBlock: todaysBlock,
          fromBlock: yesterdaysBlock,
          target: address,
          topics: [topic0],
          chain: CHAIN.MANTA,
        })
      )
    )
  ).flat();
  const withdrawAmount = logsWithdrawal
    .map((log: ethers.EventLog) => {
      const parsedLog = log.data.replace("0x", "");
      const amount = Number("0x" + parsedLog.slice(0, 64));
      return amount;
    })
    .reduce((a: number, b: number) => a + b, 0);
  const [feeWalletStart, feeWalletEnd, l1FeeVaultStart, l1FeeVaultEnd] = (
    await Promise.all([
      getBalance({
        target: feeWallet,
        block: yesterdaysBlock,
        chain: CHAIN.MANTA,
      }),
      getBalance({
        target: feeWallet,
        block: todaysBlock,
        chain: CHAIN.MANTA,
      }),
      getBalance({
        target: l1FeeVault,
        block: yesterdaysBlock,
        chain: CHAIN.MANTA,
      }),
      getBalance({
        target: l1FeeVault,
        block: todaysBlock,
        chain: CHAIN.MANTA,
      }),
    ])
  ).map((i) => i.output);
  const ethBalance = new BigNumber(feeWalletEnd)
    .minus(feeWalletStart)
    .plus(new BigNumber(l1FeeVaultEnd).minus(l1FeeVaultStart));
  return ethBalance.plus(withdrawAmount).div(1e18);
}

const fetch = async (timestamp: number, chainBlocks: ChainBlocks): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24;
  const toTimestamp = timestamp;
  const sql = postgres(process.env.INDEXA_DB!);
  const now = new Date(timestamp * 1e3);
  const dayAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24);
  try {
    const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
    const pricesObj: any = await getPrices([ethAddress], toTimestamp);
    const latestPrice = pricesObj[ethAddress]["price"];

    const sequencerGas = sql`
        SELECT
            sum(ethereum.transactions.gas_used * ethereum.transactions.gas_price) / 10 ^ 18 AS sum
        FROM
            ethereum.transactions
            INNER JOIN ethereum.blocks ON ethereum.transactions.block_number = ethereum.blocks.number
        WHERE (to_address = '\\x30c789674ad3b458886bbc9abf42eee19ea05c1d'::bytea
        or to_address = '\\xAEbA8e2307A22B6824a9a7a39f8b016C357Cd1Fe'::bytea) AND (block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()});
        `;
    const [totalFees, totalSpentBySequencer] = await Promise.all([
      getFees(toTimestamp, fromTimestamp, chainBlocks),
      sequencerGas,
    ]);
    const finalDailyFee = totalFees.times(latestPrice);
    const revenue = totalFees.minus(totalSpentBySequencer[0].sum).times(latestPrice);
    await sql.end({ timeout: 3 });
    return {
      timestamp,
      dailyFees: `${finalDailyFee.toString()}`,
      dailyRevenue: `${revenue.toString()}`,
    };
  } catch (error) {
    await sql.end({ timeout: 3 });
    console.error(error);
    throw error;
  }
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.MANTA]: {
      fetch: fetch,
      start: async () => 1694217600,
    },
  },
  protocolType: ProtocolType.CHAIN,
};

export default adapter;
