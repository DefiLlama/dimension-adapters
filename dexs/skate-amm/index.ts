import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";
import { timeFilter } from "../../helpers/alliumSolanaEvents";

// eventEmitter() of each chain's v2 PeripheryManager; every v2 periphery pool emits its swaps through it
const EVENT_EMITTERS: Record<string, string> = {
  [CHAIN.ETHEREUM]: "0xBE70a635A99CDb5675C13db4867E053839224F50",
  [CHAIN.BSC]: "0x71a06aE513D303A619A8a4AB670e5Ae7e8F98EF9",
  [CHAIN.ARBITRUM]: "0xB301150AFA170816Ae18EC21e2A830Ddc7bBA1De",
  [CHAIN.BASE]: "0xf95e0a4932bBE5E27561486da809cbE0E54551A4",
  [CHAIN.ROBINHOOD]: "0x1E4248a5B24AF537175f87ED33CcD8108B95e154",
};

const SWAPPED_EVENT = "event Swapped(address peripheryPool, address kernelPool, address user, bool zeroForOne, int256 amountSpecified, uint160 sqrtPriceLimitX96)";

const SOLANA_PERIPHERY_PROGRAM = "SPPZB76TV1oSusXvGYQDK7KZGyLBmWbr8CuzNcjb98y";
const SWAP_DISCRIMINATOR = "f8c69e91e17587c8";

// v2 Solana periphery pools and their fee in bps, from the pool list of amm.skatechain.org
const SOLANA_POOL_FEE_BPS: Record<string, number> = {
  G2j8vLu3ryzUqPYpknpBcBLDcFiiRmXtB7z9Dpg9dVxe: 1, // USDC/USDT
  "3D97C7WAPfXzmKLFXZDqe7KNtauKJhEvJDJE7htT3YRh": 5, // QQQx/USDC
  CciQYe2K8PrabWMDXpomHAEyj4Cfj3DqeqYeWRwvDV6q: 5, // NVDAx/USDC
  CZTjdXGous5DFxYyaVqx4jdYPmvadYzmH2wsVF5wdEzk: 5, // WETH/USDG
  EdXkCtXKZRiad2Bn4H5GLDsDxneADPyp21E8zddsUqPH: 5, // SKATE/USDC
  "7Pe4XHsmM3EUK4TVP5vsdVFDamK4tdEYhBfDvGG14SBN": 5, // SPYx/USDC
  CDqpy9hp3uRimtjPWvYVYAXy8uTVKSF9DnMNawtee3Bu: 5, // AAPLx/USDC
};

const fetchEvm = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const swaps = await options.getLogs({ target: EVENT_EMITTERS[options.chain], eventAbi: SWAPPED_EVENT });
  const pools: string[] = [...new Set<string>(swaps.map((swap: any) => swap.peripheryPool))];
  const [token0s, token1s, poolFees] = await Promise.all(
    ["address:token0", "address:token1", "uint24:fee"].map((abi) => options.api.multiCall({ abi, calls: pools }))
  );

  for (const swap of swaps) {
    const i = pools.indexOf(swap.peripheryPool);
    const amountIn = BigInt(swap.amountSpecified);
    const tokenIn = swap.zeroForOne ? token0s[i] : token1s[i];
    dailyVolume.add(tokenIn, amountIn);
    dailyFees.add(tokenIn, amountIn * BigInt(poolFees[i]) / 1_000_000n);
  }

  return { dailyVolume, dailyFees };
};

// A user's swap moves the input token from the user into the pool's vaults, owned by the pool authority (instruction account 7)
const fetchSolana = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const rows = await queryAllium(`
    WITH swaps AS (
      SELECT txn_id, instruction_index, accounts[2]::STRING AS pool, accounts[7]::STRING AS pool_authority
      FROM solana.raw.instructions
      WHERE program_id = '${SOLANA_PERIPHERY_PROGRAM}' AND data_hex_first16 = '${SWAP_DISCRIMINATOR}' AND parent_tx_success
        AND ${timeFilter(options)}
    ),
    inputs AS (
      SELECT s.pool, t.mint, SUM(t.raw_amount) AS amount
      FROM swaps s
      JOIN solana.assets.transfers t
        ON t.txn_id = s.txn_id AND t.instruction_index = s.instruction_index AND t.to_address = s.pool_authority
      WHERE ${timeFilter(options, "t.")}
      GROUP BY 1, 2
    ),
    checks AS (
      SELECT EXISTS (SELECT 1 FROM solana.assets.transfers
        WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.endTimestamp})
          AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp + 15 * 60})) AS indexed
    )
    SELECT k.indexed, i.pool, i.mint, i.amount FROM checks k LEFT JOIN inputs i ON TRUE
  `);
  if (!rows[0]?.indexed) throw new Error(`skate-amm: Allium has not indexed Solana past ${new Date(options.endTimestamp * 1e3).toISOString()} yet`);

  for (const { pool, mint, amount } of rows) {
    if (!pool) continue;
    const feeBps = SOLANA_POOL_FEE_BPS[pool];
    if (feeBps === undefined) throw new Error(`skate-amm: unknown Solana pool ${pool}`);
    dailyVolume.add(mint, amount);
    dailyFees.add(mint, Number(amount) * feeBps / 1e4);
  }

  return { dailyVolume, dailyFees };
};

const V2_START = "2026-08-06";

const methodology = {
  Volume: "Tokens users sell into Skate AMM v2 pools on Ethereum, BSC, Arbitrum, Base, Robinhood Chain and Solana.",
  Fees: "Swap fees paid by users, 0.05% of the input on most pools and 0.01% on USDC/USDT pools.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  dependencies: [Dependencies.ALLIUM],
  adapter: {
    ...Object.fromEntries(Object.keys(EVENT_EMITTERS).map((chain) => [chain, { fetch: fetchEvm, start: V2_START }])),
    [CHAIN.SOLANA]: { fetch: fetchSolana, start: V2_START },
  },
};

export default adapter;
