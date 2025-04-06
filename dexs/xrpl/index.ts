import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpPost, httpGet } from "../../utils/fetchURL";

const RPC = "https://xrplcluster.com";
const XRPSCAN_POOLS_API = "https://api.xrpscan.com/api/v1/amm/pools";
const LEDGER_SAMPLE_SIZE = 1000;
const LEDGER_STEP = 10;

const fetchAllAMMPools = async () => {
  let offset = 0;
  const limit = 100;
  let pools: any[] = [];
  while (true) {
    const response = await httpGet(`${XRPSCAN_POOLS_API}?offset=${offset}&limit=${limit}`);
    if (!response.length) break;
    pools = pools.concat(response);
    offset += limit;
  }
  return pools;
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();
  // Precargar todos los AMMs
  const pools = await fetchAllAMMPools();
  const ammMap = new Map<string, number>();
  for (const pool of pools) {
    if (pool.index && pool.TradingFee !== undefined) {
      ammMap.set(pool.index, pool.TradingFee / 1_000_000); // convertir a porcentaje
    }
  }


  // Volume
  // adjust for a daily run
  const currentLedger = 95249409;
  const startLedger = currentLedger; // For daily fetch

  for (let i = startLedger; i <= currentLedger; i += LEDGER_STEP) {
    try {
      const ledger = await httpPost(RPC, {
        method: "ledger",
        params: [{
          ledger_index: i,
          transactions: true,
          expand: true,
        }],
      });

      for (const tx of ledger.result.ledger.transactions ?? []) {
        if (!tx.metaData?.AffectedNodes) continue;

        if (
          (tx.TransactionType === "OfferCreate" || tx.TransactionType === "Payment") &&
          tx.metaData.TransactionResult === "tesSUCCESS"
        ) {
          const interactedWithAMM = tx.metaData.AffectedNodes.some((node: any) => {
            const flags = node.ModifiedNode?.FinalFields?.Flags;
            return (
              node.ModifiedNode?.LedgerEntryType === "RippleState" &&
              (flags & 0x01000000) !== 0
            );
          });
            if (tx.TransactionType === "OfferCreate") {
              const sender = tx.Account;
              // using TakerPays and TakerGets to get the asset sent
              const sentRaw = tx.TakerPays?.value || tx.TakerPays || tx.TakerGets?.value || tx.TakerGets || "0";
              const sent = parseFloat(typeof sentRaw === "string" ? sentRaw : sentRaw.value || "0");
              const assetSent = tx.TakerPays?.currency || tx.TakerPays?.value?.currency || tx.TakerGets?.currency || tx.TakerGets?.value?.currency || "XRP";
              if (interactedWithAMM) { // fees are only charged if the transaction interacts with an AMM
              const ammNode = tx.metaData.AffectedNodes.find((node: any) =>
                node.ModifiedNode?.FinalFields?.AMMID
              );
              const ammID = ammNode?.ModifiedNode?.FinalFields?.AMMID;
              if (!ammID || !ammMap.has(ammID)) {
                console.warn("No AMMID or AMMID not in pool map for tx", tx.hash);
                continue;
              }
              const tradingFee = ammMap.get(ammID) || 0;
              const ammFee = tradingFee * sent;
              dailyFees.add(assetSent, ammFee);
            }
          } else if (tx.TransactionType === "Payment") {
            const sentRaw = tx.SendMax?.value || tx.SendMax || tx.Amount?.value || tx.Amount || "0";
            const sent = parseFloat(typeof sentRaw === "string" ? sentRaw : sentRaw.value || "0");
            const assetSent = tx.SendMax?.currency || tx.SendMax?.value?.currency || tx.Amount?.currency || tx.Amount?.value?.currency || "XRP";
            if (interactedWithAMM) { 
                const ammNode = tx.metaData.AffectedNodes.find((node: any) =>
                  node.ModifiedNode?.FinalFields?.AMMID
                );
                const ammID = ammNode?.ModifiedNode?.FinalFields?.AMMID;
                if (!ammID || !ammMap.has(ammID)) {
                  console.warn("No AMMID or AMMID not in pool map for tx", tx.hash);
                  continue;
                }
                const tradingFee = ammMap.get(ammID) || 0;
                const ammFee = tradingFee * sent;
                dailyFees.add(assetSent, ammFee);
          }
            dailyVolume.add(assetSent, sent);
          }
        }
      }
    } catch (err) {
      console.warn(`Skipping ledger ${i}:`, err.message || err);
    }
  }

  console.log(dailyFees)
  console.log(dailyVolume)
  return { dailyFees, dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.RIPPLE]: {
      fetch: fetch,
      runAtCurrTime: true,
    },
  },
};

export default adapter;
