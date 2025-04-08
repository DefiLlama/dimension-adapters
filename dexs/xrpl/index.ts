import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpPost, httpGet } from "../../utils/fetchURL";
import { getCache, setCache } from "../../helpers/cache";
import { cache } from "@defillama/sdk";


const RPC = "https://xrplcluster.com";
const XRPSCAN_POOLS_API = "https://api.xrpscan.com/api/v1/amm/pools";
const LEDGER_STEP = 10;


const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));


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
  

  const pools = await fetchAllAMMPools();
  const ammMap = new Map<string, number>();
  for (const pool of pools) {
    if (pool.index && pool.TradingFee !== undefined) {
      ammMap.set(pool.index, pool.TradingFee / 1_000_000);
    }
  }

  const cachedLedger  = await getCache('xrpl-dex', 'lastLedger') || 95249409;
  const currentLedgerInfo = await httpPost(RPC, {
    method: "ledger",
    params: [{
      ledger_index: "validated",
      expand: false,
    }],
  });
  
  const currentLedger = currentLedgerInfo.result.ledger.ledger_index;
  
  const LEDGER_PER_DAY = 21600;
  const startLedger = cachedLedger.currentLedger ? currentLedger - LEDGER_PER_DAY : currentLedger - LEDGER_PER_DAY;
    
  // Get a call to get current ledger index substract 1 to get the last ledger index
  console.log(startLedger, currentLedger);

  const ledgersToFetch = Math.ceil((currentLedger - startLedger) / LEDGER_STEP);
  const sleepTime = ledgersToFetch > 300 ? 150 : 50;

  for (let i = startLedger; i <= currentLedger; i += LEDGER_STEP) {
    try {
      await sleep(sleepTime)
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
              ((flags & 0x01000000) !== 0)
            );
          });
            if (tx.TransactionType === "OfferCreate") {
              // using TakerPays and TakerGets to get the asset sent
              const sentRaw = tx.TakerPays?.value || tx.TakerPays || tx.TakerGets?.value || tx.TakerGets || "0";
              const sent = parseFloat(typeof sentRaw === "string" ? sentRaw : sentRaw.value || "0");
              let assetSent = tx.TakerPays?.currency || tx.TakerPays?.value?.currency || tx.TakerGets?.currency || tx.TakerGets?.value?.currency || "XRP";
              if (assetSent !== "XRP") {
                const issuer = tx.SendMax?.issuer || tx.Amount?.issuer ;
                if (issuer) {
                  assetSent = assetSent + "." + issuer; 
                }
              }
              if (interactedWithAMM) { // fees are only charged if the transaction interacts with an AMM
              const ammNode = tx.metaData.AffectedNodes.find((node: any) =>
                node.ModifiedNode?.FinalFields?.AMMID
              );
              const ammID = ammNode?.ModifiedNode?.FinalFields?.AMMID;
              const tradingFee = ammMap.get(ammID) || 0;
              const ammFee = tradingFee * sent;
              dailyFees.add(assetSent, ammFee);
            }
          } else if (tx.TransactionType === "Payment") {
            const sentRaw = tx.SendMax?.value || tx.SendMax || tx.Amount?.value || tx.Amount || "0";
            const sent = parseFloat(typeof sentRaw === "string" ? sentRaw : sentRaw.value || "0");
            let assetSent = tx.SendMax?.currency || tx.SendMax?.value?.currency || tx.Amount?.currency || tx.Amount?.value?.currency || "XRP";
            if (assetSent !== "XRP") {
              const issuer = tx.SendMax?.issuer || tx.Amount?.issuer ;
              if (issuer) {
                assetSent = assetSent + "." + issuer; 
              }
            }
            if (interactedWithAMM) { 
                const ammNode = tx.metaData.AffectedNodes.find((node: any) =>
                  node.ModifiedNode?.FinalFields?.AMMID
                );
                const ammID = ammNode?.ModifiedNode?.FinalFields?.AMMID;
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
  await setCache('xrpl-dex', 'lastLedger', { lastLedger: currentLedger, lastUpdate: Date.now() });
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
