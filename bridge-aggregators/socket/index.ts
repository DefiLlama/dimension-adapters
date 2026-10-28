import ADDRESSES from '../../helpers/coreAssets.json'
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

// repo chain => Dune blockchain name + wrapped-native token address. noErc20 = no decoded erc20 table on Dune
const chainConfig: Record<string, { dune: string; wrapped: string; noErc20?: boolean; nativeScale?: number }> = {
  [CHAIN.ETHEREUM]: { dune: "ethereum", wrapped: ADDRESSES.ethereum.WETH },
  [CHAIN.OPTIMISM]: { dune: "optimism", wrapped: ADDRESSES.optimism.WETH_1 },
  [CHAIN.BSC]: { dune: "bnb", wrapped: ADDRESSES.bsc.WBNB },
  [CHAIN.XDAI]: { dune: "gnosis", wrapped: ADDRESSES.xdai.WXDAI },
  [CHAIN.POLYGON]: { dune: "polygon", wrapped: ADDRESSES.polygon.WMATIC_2 },
  [CHAIN.MANTLE]: { dune: "mantle", wrapped: ADDRESSES.mantle.WMNT },
  [CHAIN.BASE]: { dune: "base", wrapped: ADDRESSES.optimism.WETH_1 },
  [CHAIN.ARBITRUM]: { dune: "arbitrum", wrapped: ADDRESSES.arbitrum.WETH },
  [CHAIN.LINEA]: { dune: "linea", wrapped: ADDRESSES.linea.WETH },
  [CHAIN.AVAX]: { dune: "avalanche_c", wrapped: ADDRESSES.avax.WAVAX },
  [CHAIN.SCROLL]: { dune: "scroll", wrapped: ADDRESSES.scroll.WETH },
  [CHAIN.BLAST]: { dune: "blast", wrapped: ADDRESSES.blast.WETH },
  [CHAIN.MODE]: { dune: "mode", wrapped: ADDRESSES.optimism.WETH_1, noErc20: true },
  [CHAIN.SONIC]: { dune: "sonic", wrapped: ADDRESSES.sonic.wS },
  [CHAIN.UNICHAIN]: { dune: "unichain", wrapped: ADDRESSES.optimism.WETH_1 },
  [CHAIN.WC]: { dune: "worldchain", wrapped: ADDRESSES.optimism.WETH_1 },
  [CHAIN.INK]: { dune: "ink", wrapped: ADDRESSES.optimism.WETH_1 },
  [CHAIN.BERACHAIN]: { dune: "berachain", wrapped: ADDRESSES.berachain.WBERA },
  [CHAIN.SEI]: { dune: "sei", wrapped: "0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7" },
  [CHAIN.HYPERLIQUID]: { dune: "hyperevm", wrapped: ADDRESSES.hyperliquid.WHYPE },
  [CHAIN.MEGAETH]: { dune: "megaeth", wrapped: ADDRESSES.optimism.WETH_1 },
  [CHAIN.MONAD]: { dune: "monad", wrapped: ADDRESSES.monad.WMON },
  [CHAIN.PLASMA]: { dune: "plasma", wrapped: ADDRESSES.plasma.WXPL },
  [CHAIN.KATANA]: { dune: "katana", wrapped: ADDRESSES.katana.VB_WETH },
  [CHAIN.PLUME]: { dune: "plume", wrapped: ADDRESSES.plume_mainnet.WPLUME },
  [CHAIN.ROBINHOOD]: { dune: "robinhood", wrapped: ADDRESSES.robinhood.WETH },
  // Arc's native interface uses 18 decimals while the USDC ERC-20 facade (same
  // underlying balance) uses 6, so native value must be scaled down before being
  // priced as that token. https://docs.arc.io/arc/concepts/stablecoin-native-model
  [CHAIN.ARC]: { dune: "arc", wrapped: ADDRESSES.arc.USDC, nativeScale: 1e12 },
};

// Native and ERC20 flows, dedupe largest per tx, group by chain + token for DefiLlama pricing
const buildQuery = (options: FetchOptions): string => {
  const start = options.startTimestamp;
  const end = options.endTimestamp;

  const native = Object.entries(chainConfig).map(([chain, cfg]) => `
    SELECT '${chain}' AS chain, t.hash AS tx_hash,
           ${cfg.wrapped} AS token_address, TRY_CAST(t.value AS double)${cfg.nativeScale ? ` / ${cfg.nativeScale}` : ''} AS amount
    FROM ${cfg.dune}.transactions t
    WHERE t.to IN (${ALLOWANCE_HOLDER}, ${OPEN_ROUTER}) AND t.value > UINT256 '0' AND t.success
      AND t.block_time >= from_unixtime(${start}) AND t.block_time < from_unixtime(${end})`).join("\n    UNION ALL");

  const erc20 = Object.entries(chainConfig).filter(([, cfg]) => !cfg.noErc20).map(([chain, cfg]) => `
    SELECT '${chain}' AS chain, tr.evt_tx_hash AS tx_hash,
           tr.contract_address AS token_address,
           TRY_CAST(tr.value AS double) AS amount
    FROM erc20_${cfg.dune}.evt_Transfer tr
    LEFT JOIN tokens.erc20 tok ON tok.contract_address = tr.contract_address AND tok.blockchain = '${cfg.dune}'
    WHERE tr.to IN (${ALLOWANCE_HOLDER}, ${OPEN_ROUTER}) AND tr."from" NOT IN (${ALLOWANCE_HOLDER}, ${OPEN_ROUTER})
      AND tr.evt_block_time >= from_unixtime(${start}) AND tr.evt_block_time < from_unixtime(${end})`).join("\n    UNION ALL");

  return `
  WITH
  native_raw AS (${native}),
  erc20_raw AS (${erc20}),
  all_raw AS (SELECT * FROM native_raw UNION ALL SELECT * FROM erc20_raw),
  refined AS (
    SELECT chain, token_address, amount
    FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY chain, tx_hash ORDER BY amount DESC) AS rnk FROM all_raw)
    WHERE rnk = 1
  )
  SELECT chain, token_address AS token, SUM(amount) AS amount
  FROM refined
  GROUP BY 1, 2`;
};

// Dune only for post-cutover and use vault logs before cutover
const prefetch = async (options: FetchOptions) =>
  options.endTimestamp <= CUTOVER ? null : queryDuneSql(options, buildQuery(options));

const fetch = async (options: FetchOptions) => {
  if (options.endTimestamp <= CUTOVER) return fetchVaultVolume(options);

  const dailyBridgeVolume = options.createBalances();
  for (const row of options.preFetchedResults ?? []) {
    if (row.chain !== options.chain || !row.token || !row.amount) continue;
    dailyBridgeVolume.addToken(row.token, row.amount);
  }
  return { dailyBridgeVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  prefetch,
  adapter: Object.keys(chainConfig).reduce((acc, chain) => ({
    ...acc,
    [chain]: { fetch, start: SocketVaults[chain] ? SLL_START : ROUTER_START },
  }), {}),
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    BridgeVolume: "From 2026-06-11 (router launch): token inflows into Socket Protocol's OpenRouter and AllowanceHolder routers — native value plus ERC20 transfers in, taking the single largest token per transaction as the routed amount; mirrors the socketprotocol/socket-data dashboard and counts both bridge and swap routing. Before 2026-06-11: deposits and withdrawals through the Socket Liquidity Layer SuperToken vaults, summed from on-chain vault events.",
  },
};

export default adapter;
