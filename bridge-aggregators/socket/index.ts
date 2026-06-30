import { Interface } from "ethers";
import * as sdk from "@defillama/sdk";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { SocketVaults } from "./contracts";

// Two methods: pre-2026-06-11 vault logs, post-2026-06-11 router inflows (Dune)
const ROUTER_START = "2026-06-11";
const CUTOVER = Math.floor(Date.parse(`${ROUTER_START}T00:00:00Z`) / 1000);
const SLL_START = "2023-08-10";

// Liquidity Layer: vault lock/unlock events on host chains
const SocketVaultAbis = {
  TokensDeposited: "event TokensDeposited(address connector, address depositor, address receiver, uint256 depositAmount)",
  TokensUnlocked: "event TokensUnlocked(address connector, address receiver, uint256 unlockedAmount)",
  TokensBridged: "event TokensBridged(address connecter, address receiver, uint256 amount, bytes32 messageId)",
  BridgingTokens: "event BridgingTokens(address connector, address sender, address receiver, uint256 amount, bytes32 messageId)",
};

function getToken(chain: string, vaultAddress: string): string | null {
  vaultAddress = sdk.util.normalizeAddress(vaultAddress);
  if (SocketVaults[chain]) {
    for (const [vault, token] of Object.entries(SocketVaults[chain])) {
      if (sdk.util.normalizeAddress(vault) === vaultAddress) return token;
    }
  }
  return null;
}

const fetchVaultVolume = async (options: FetchOptions) => {
  const dailyBridgeVolume = options.createBalances();
  const vaults = SocketVaults[options.chain];
  if (!vaults) return { dailyBridgeVolume };

  const vaultContract = new Interface(Object.values(SocketVaultAbis));
  const targets = Object.keys(vaults);
  const collect = async (eventAbi: string, amountKey: string) => {
    const logs = await options.getLogs({ eventAbi, entireLog: true, targets });
    for (const log of logs) {
      const decoded = vaultContract.parseLog(log);
      const token = getToken(options.chain, log.address);
      if (decoded && token) dailyBridgeVolume.add(token, decoded.args[amountKey]);
    }
  };
  // Each transfer crosses one vault event
  await collect(SocketVaultAbis.TokensDeposited, "depositAmount");
  await collect(SocketVaultAbis.TokensBridged, "amount");
  await collect(SocketVaultAbis.BridgingTokens, "amount");
  await collect(SocketVaultAbis.TokensUnlocked, "unlockedAmount");
  return { dailyBridgeVolume };
};

const ALLOWANCE_HOLDER = "0x50c4E75a512F2A14A7b304787Adf79C4531A5909";
const OPEN_ROUTER = "0x50cFe7c1938dB66A1a6D2e86D36F39FBef3d5c4a";

// repo chain => Dune blockchain name + wrapped-native (for pricing). noErc20 = no decoded erc20 table on Dune
const chainConfig: Record<string, { dune: string; wrapped: string; noErc20?: boolean }> = {
  [CHAIN.ETHEREUM]: { dune: "ethereum", wrapped: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" },
  [CHAIN.OPTIMISM]: { dune: "optimism", wrapped: "0x4200000000000000000000000000000000000006" },
  [CHAIN.BSC]: { dune: "bnb", wrapped: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" },
  [CHAIN.XDAI]: { dune: "gnosis", wrapped: "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d" },
  [CHAIN.POLYGON]: { dune: "polygon", wrapped: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270" },
  [CHAIN.MANTLE]: { dune: "mantle", wrapped: "0x78c1b0c915c4faa5fffa6cabf0219da63d7f4cb8" },
  [CHAIN.BASE]: { dune: "base", wrapped: "0x4200000000000000000000000000000000000006" },
  [CHAIN.ARBITRUM]: { dune: "arbitrum", wrapped: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1" },
  [CHAIN.LINEA]: { dune: "linea", wrapped: "0xe5d7c2a44ffddf6b295a15c148167daaaf5cf34f" },
  [CHAIN.AVAX]: { dune: "avalanche_c", wrapped: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7" },
  [CHAIN.SCROLL]: { dune: "scroll", wrapped: "0x5300000000000000000000000000000000000004" },
  [CHAIN.BLAST]: { dune: "blast", wrapped: "0x4300000000000000000000000000000000000004" },
  [CHAIN.MODE]: { dune: "mode", wrapped: "0x4200000000000000000000000000000000000006", noErc20: true },
  [CHAIN.SONIC]: { dune: "sonic", wrapped: "0x039e2fB66102314Ce7b64Ce5Ce3E5183bc94aD38" },
  [CHAIN.UNICHAIN]: { dune: "unichain", wrapped: "0x4200000000000000000000000000000000000006" },
  [CHAIN.WC]: { dune: "worldchain", wrapped: "0x4200000000000000000000000000000000000006" },
  [CHAIN.INK]: { dune: "ink", wrapped: "0x4200000000000000000000000000000000000006" },
  [CHAIN.BERACHAIN]: { dune: "berachain", wrapped: "0x6969696969696969696969696969696969696969" },
  [CHAIN.SEI]: { dune: "sei", wrapped: "0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7" },
  [CHAIN.HYPERLIQUID]: { dune: "hyperevm", wrapped: "0x5555555555555555555555555555555555555555" },
};

// Native and ERC20 flows, dedupe largest per tx, priced via prices.day
const buildQuery = (options: FetchOptions): string => {
  const start = options.startTimestamp;
  const end = options.endTimestamp;

  const native = Object.values(chainConfig).map(cfg => `
    SELECT '${cfg.dune}' AS chain, t.hash AS tx_hash, t.block_time AS block_time,
           ${cfg.wrapped} AS price_address, TRY_CAST(t.value AS double) / 1e18 AS amount
    FROM ${cfg.dune}.transactions t CROSS JOIN routers r
    WHERE (t.to = r.ah OR t.to = r.openrouter) AND t.value > UINT256 '0' AND t.success
      AND t.block_time >= from_unixtime(${start}) AND t.block_time < from_unixtime(${end})`).join("\n    UNION ALL");

  const erc20 = Object.values(chainConfig).filter(cfg => !cfg.noErc20).map(cfg => `
    SELECT '${cfg.dune}' AS chain, tr.evt_tx_hash AS tx_hash, tr.evt_block_time AS block_time,
           tr.contract_address AS price_address,
           TRY_CAST(tr.value AS double) / POWER(10, COALESCE(tok.decimals, 18)) AS amount
    FROM erc20_${cfg.dune}.evt_Transfer tr CROSS JOIN routers r
    LEFT JOIN tokens.erc20 tok ON tok.contract_address = tr.contract_address AND tok.blockchain = '${cfg.dune}'
    WHERE (tr.to = r.ah OR tr.to = r.openrouter) AND tr."from" NOT IN (r.ah, r.openrouter)
      AND tr.evt_block_time >= from_unixtime(${start}) AND tr.evt_block_time < from_unixtime(${end})`).join("\n    UNION ALL");

  return `
  WITH routers(ah, openrouter) AS (VALUES (${ALLOWANCE_HOLDER}, ${OPEN_ROUTER})),
  native_raw AS (${native}),
  erc20_raw AS (${erc20}),
  all_raw AS (SELECT * FROM native_raw UNION ALL SELECT * FROM erc20_raw),
  refined AS (
    SELECT chain, tx_hash, block_time, price_address, amount
    FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY chain, tx_hash ORDER BY amount DESC) AS rnk FROM all_raw)
    WHERE rnk = 1
  )
  SELECT r.chain AS chain, SUM(COALESCE(p.price * r.amount, 0)) AS vol_usd
  FROM refined r
  LEFT JOIN prices.day p
    ON p.blockchain = r.chain
   AND p.contract_address = r.price_address
   AND DATE_TRUNC('day', p.timestamp) = DATE_TRUNC('day', r.block_time)
  GROUP BY 1`;
};

// Dune only for post-cutover and use vault logs before cutover
const prefetch = async (options: FetchOptions) =>
  options.endTimestamp <= CUTOVER ? null : queryDuneSql(options, buildQuery(options));

const fetch = async (options: FetchOptions) => {
  if (options.endTimestamp <= CUTOVER) return fetchVaultVolume(options);

  const { dune } = chainConfig[options.chain];
  const row = options.preFetchedResults.find((r: any) => r.chain === dune);
  return { dailyBridgeVolume: row ? Number(row.vol_usd) : 0 };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  prefetch,
  adapter: Object.keys(chainConfig).reduce((acc, chain) => ({
    ...acc,
    [chain]: { fetch, start: SocketVaults[chain] ? SLL_START : ROUTER_START },
  }), {}),
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    BridgeVolume: "From 2026-06-11 (router launch): token inflows into Socket Protocol's OpenRouter and AllowanceHolder routers — native value plus ERC20 transfers in, taking the single largest token per transaction as the routed amount, priced in USD; mirrors the socketprotocol/socket-data dashboard and counts both bridge and swap routing. Before 2026-06-11: deposits and withdrawals through the Socket Liquidity Layer SuperToken vaults, summed from on-chain vault events.",
  },
};

export default adapter;
