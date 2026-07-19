import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import ADDRESSES from "../helpers/coreAssets.json";

const NEW_ORDER_ABI = "event NewOrder(uint256 id, uint256 offerId, uint256 amount, address seller, address buyer)";
const OFFERS_ABI = "function offers(uint256) view returns (uint8 offerType, bytes32 tokenId, address exToken, uint256 amount, uint256 value, uint256 collateral, uint256 filledAmount, uint8 status, address offeredBy, bool fullMatch)";
const SOLANA_PROGRAM = "stPdYNaJNsV3ytS9Xtx4GXXXRcVqVS6x66ZFa26K39S";

const config: Record<string, { contract?: string; start: string }> = {
  [CHAIN.SOLANA]: { start: "2023-12-13" },
  [CHAIN.ETHEREUM]: { contract: "0x1ecdb32e59e948c010a189a0798c674a2d0c6603", start: "2024-01-29" },
  [CHAIN.BASE]: { contract: "0xdf02eeaB3CdF6eFE6B7cf2EB3a354dCA92A23092", start: "2024-01-29" },
  [CHAIN.ERA]: { contract: "0xE6c5F63623A2aE769dd3D505Bc44D7EB21dd974b", start: "2024-01-29" },
  [CHAIN.ARBITRUM]: { contract: "0x7a560269480Ef38B885526C8bBecdc4686d8bF7A", start: "2024-01-29" },
  [CHAIN.BSC]: { contract: "0x7a560269480Ef38B885526C8bBecdc4686d8bF7A", start: "2024-01-29" },
  [CHAIN.OPTIMISM]: { contract: "0x0e57fFf83aE53b22c5B656745168b21A9d2AC3DA", start: "2024-01-29" },
  [CHAIN.LINEA]: { contract: "0x7a560269480Ef38B885526C8bBecdc4686d8bF7A", start: "2024-01-29" },
  [CHAIN.MODE]: { contract: "0x7a560269480Ef38B885526C8bBecdc4686d8bF7A", start: "2024-02-15" },
  [CHAIN.SCROLL]: { contract: "0x7a560269480Ef38B885526C8bBecdc4686d8bF7A", start: "2024-01-29" },
  [CHAIN.TAIKO]: { contract: "0x7a560269480Ef38B885526C8bBecdc4686d8bF7A", start: "2024-06-01" },
  [CHAIN.BERACHAIN]: { contract: "0x7a560269480Ef38B885526C8bBecdc4686d8bF7A", start: "2025-02-06" },
  [CHAIN.AVAX]: { contract: "0x7a560269480Ef38B885526C8bBecdc4686d8bF7A", start: "2024-01-29" },
  [CHAIN.HYPERLIQUID]: { contract: "0xE2300eC1a92e3ca0Cf91269C28CaDCa58826E72C", start: "2025-02-18" },
  [CHAIN.ABSTRACT]: { contract: "0xeFFcBE4711Bc9360F596CA615b3C4003A0d7Ea33", start: "2025-01-27" },
};

const addVolume = (dailyVolume: any, exToken: string, amount: number) => {
  if (amount <= 0) return;
  if (exToken.toLowerCase() === ADDRESSES.null) dailyVolume.addGasToken(amount);
  else dailyVolume.add(exToken, amount);
};

const fetchEvm = async (options: FetchOptions) => {
  const target = config[options.chain].contract;
  const dailyVolume = options.createBalances();

  const orders = await options.getLogs({ target, eventAbi: NEW_ORDER_ABI });

  if (orders.length) {
    const offerIds = [...new Set(orders.map((o: any) => o.offerId.toString()))];
    // a whole multicall RPC batch can fail transiently under load; retry a few
    // times before failing the run
    let offers: any[] = [];
    for (let attempt = 0; ; attempt++) {
      try {
        offers = await options.api.multiCall({ target, abi: OFFERS_ABI, calls: offerIds, permitFailure: true });
        break;
      } catch (e) {
        if (attempt >= 3) throw e;
        await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
      }
    }
    const offersById = new Map(offerIds.map((id, i) => [id, offers[i]]));

    for (const order of orders) {
      const offer: any = offersById.get(order.offerId.toString());
      if (!offer || Number(offer.amount) === 0) continue;
      addVolume(dailyVolume, offer.exToken, Number(offer.value) * Number(order.amount) / Number(offer.amount));
    }
  }

  return { dailyVolume };
};

// Escrow authority that owns the pre-market vault token accounts: an off-curve
// PDA whose account is owned by the whales program itself (verifiable via
// getAccountInfo); same address the DefiLlama TVL adapter sums balances for.
const SOLANA_ESCROW = "GDsMbTq82sYcxPRLdQ9RHL9ZLY3HNVpXjXtCnyxpb2rQ";

const solSql = () => `
    WITH fill_txs AS (
        SELECT DISTINCT tx_id
        FROM solana.instruction_calls
        WHERE tx_success
          AND executing_account = '${SOLANA_PROGRAM}'
          AND is_inner = false
          AND TIME_RANGE
          AND ANY_MATCH(log_messages, x -> x LIKE '%FillOffer%')
    )
    SELECT
        t.token_mint_address AS mint,
        SUM(t.amount) AS amount
    FROM tokens_solana.transfers t
    JOIN fill_txs f ON t.tx_id = f.tx_id
    WHERE t.to_owner = '${SOLANA_ESCROW}'
      AND TIME_RANGE
    GROUP BY t.token_mint_address
`;

const fetchSolana = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const rows = await queryDuneSql(options, solSql());
  for (const row of rows || []) {
    if (row.mint && row.amount) dailyVolume.add(row.mint, row.amount);
  }
  return { dailyVolume };
};

const fetch = async (options: FetchOptions) => {
  if (options.chain === CHAIN.SOLANA) return fetchSolana(options);
  return fetchEvm(options);
};

const adapter: SimpleAdapter = {
  version: 1, 
  fetch,
  adapter: config,
  dependencies: [Dependencies.DUNE],
  methodology: {
    Volume:
      "USD value of filled OTC orders on Whales Market pre-markets. EVM fills are valued pro-rata against the offer they fill (read from the contract); Solana fills are valued as the tokens deposited into the program escrow in the fill transaction.",
  },
};

export default adapter;
