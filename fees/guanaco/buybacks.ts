import { PromisePool } from "@supercharge/promise-pool";
import fetchURL from "../../utils/fetchURL";

// The GUA category is published on https://guanaco.fi/gua.
const gua = "742a7585d0d5cb35b2a45d26425e23b059b72e82d7036dd97e85da5ab57a8d6c";
// Treasury and project GUA/BCH pool locking scripts used by the public GUA burn verifier.
const treasuryScript = "76a914748e3dffdc1ab726e8d7d8d381e56034871fe62388ac";
const projectPoolScript = "aa2065e10ee37a522d27573df932433dd8de92e43159162a9b69eef08af4cf9df85287";
const txidPattern = /^[0-9a-f]{64}$/;
const firstBuybackDay = 1795564800; // 2026-11-25 UTC, block 978934.
// Explorer reports the raw block timestamp. The trade feed uses BCH median block time.
const tradeSearchMargin = 6 * 3600;
// Selene Explorer serves confirmed BCH transaction metadata and the burn input outpoints.
const explorer = "https://explorer.selene.cash/api/v1/tx";

type TokenData = { category: string; amount: string };
type Output = { n: number; tokenData?: TokenData; scriptPubKey?: { hex: string } };
type Input = { txid: string; vout: number; prevout?: { tokenData?: TokenData } };
type Transaction = {
  txid: string;
  height: number;
  blocktime: number;
  input_count: number;
  output_count: number;
  vin: Input[];
  vout: Output[];
};
type Burn = { txid: string; height: number | null; baseUnits: string };
type Trade = { txid: string; satoshisDelta: string; grossVolumeSatoshis: string; tokenUnitsDelta: string };

function guaAmount(token?: TokenData) {
  return token?.category === gua ? BigInt(token.amount) : 0n;
}

async function transaction(id: string): Promise<Transaction> {
  if (!txidPattern.test(id)) throw new Error("Invalid Guanaco treasury transaction ID");
  const tx = await fetchURL(`${explorer}/${id}`);
  if (tx.txid !== id || !Number.isSafeInteger(tx.height) || tx.height <= 0 ||
      !Number.isSafeInteger(tx.blocktime) || tx.blocktime <= 0 ||
      !Array.isArray(tx.vin) || !Array.isArray(tx.vout))
    throw new Error(`Incomplete confirmed Guanaco treasury transaction ${id}`);
  return tx;
}

async function buybackCost(indexer: string, parentId: string, expectedUnits: bigint, height: number, start: number, end: number) {
  const buy = await transaction(parentId);
  const received = buy.vout.filter(output => output.scriptPubKey?.hex === treasuryScript)
    .reduce((sum, output) => sum + guaAmount(output.tokenData), 0n);
  if (buy.height > height || buy.output_count !== buy.vout.length || received !== expectedUnits ||
      !buy.vout.some(output => output.scriptPubKey?.hex === projectPoolScript && guaAmount(output.tokenData) > 0n))
    throw new Error(`GUA burn does not match a treasury purchase: ${parentId}`);

  if (buy.blocktime < start || buy.blocktime >= end) return 0n;
  const tradeStart = buy.blocktime - tradeSearchMargin;
  const tradeEnd = buy.blocktime + tradeSearchMargin;
  // 100 is the maximum page size. Require a matching transaction even if the page is truncated.
  const data = await fetchURL(`${indexer}/trades/${gua}?protocol=guanaco&start=${tradeStart}&end=${tradeEnd}&limit=100`);
  const matches = Array.isArray(data.trades) ? data.trades.filter((trade: Trade) => trade.txid === parentId) : [];
  const [trade] = matches;
  if (data.protocol !== "guanaco" || data.includesMempool !== false || matches.length !== 1 ||
      !/^\d+$/.test(trade.satoshisDelta) || trade.grossVolumeSatoshis !== trade.satoshisDelta ||
      BigInt(trade.satoshisDelta) <= 0n || BigInt(trade.tokenUnitsDelta) !== -received)
    throw new Error(`Cannot verify the BCH cost of GUA buyback ${parentId}`);
  return BigInt(trade.satoshisDelta);
}

export async function burnedBuybacks(indexer: string, start: number, end: number): Promise<bigint> {
  if (end <= firstBuybackDay) return 0n;

  // This is the same on-chain verified burn feed used by guanaco.fi/gua.
  const { burns } = await fetchURL("https://guanaco.fi/api/gua-stats/burns");
  if (!Array.isArray(burns)) throw new Error("Guanaco burn history is unavailable");

  const confirmed = new Map<string, Burn>();
  for (const burn of burns as Burn[]) {
    if (!txidPattern.test(burn.txid) || !/^\d+$/.test(burn.baseUnits) || confirmed.has(burn.txid))
      throw new Error("Invalid GUA burn feed");
    if (burn.height === null) continue;
    if (!Number.isSafeInteger(burn.height) || burn.height <= 0) throw new Error("Invalid GUA burn block");
    confirmed.set(burn.txid, burn);
  }

  const { results, errors } = await PromisePool.withConcurrency(2).for([...confirmed.values()]).process(async burn => {
    const tx = await transaction(burn.txid);
    if (tx.height !== burn.height) throw new Error(`GUA burn confirmation mismatch for ${burn.txid}`);
    if (tx.blocktime < start) return 0n;
    if (tx.input_count !== tx.vin.length || tx.output_count !== tx.vout.length)
      throw new Error(`Incomplete GUA burn transaction ${burn.txid}`);

    const byPurchase = new Map<string, bigint>();
    for (const input of tx.vin) {
      const bought = guaAmount(input.prevout?.tokenData);
      if (bought > 0n) byPurchase.set(input.txid, (byPurchase.get(input.txid) ?? 0n) + bought);
    }
    const total = [...byPurchase.values()].reduce((sum, units) => sum + units, 0n);
    const retained = tx.vout.reduce((sum, output) => sum + guaAmount(output.tokenData), 0n);
    const burned = BigInt(burn.baseUnits);
    if (burned <= 0n || total - retained !== burned || (retained > 0n && byPurchase.size !== 1))
      throw new Error(`Cannot allocate acquisition costs for GUA burn ${burn.txid}`);

    const { results: costs, errors: purchaseErrors } = await PromisePool.withConcurrency(2).for([...byPurchase.entries()])
      .process(([id, units]) => buybackCost(indexer, id, units, tx.height, start, end));
    if (purchaseErrors.length) throw purchaseErrors[0];
    return costs.reduce((sum, cost) => sum + cost, 0n) * burned / total;
  });
  if (errors.length) throw errors[0];
  return results.reduce((sum, sats) => sum + sats, 0n);
}
