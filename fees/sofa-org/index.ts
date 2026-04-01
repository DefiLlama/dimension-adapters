import ADDRESSES from "../../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getConfig } from "../../helpers/cache";

const mintABIs = {
  dnt: "event Minted(address minter, address maker, address referral, uint256 totalCollateral, uint256 term, uint256 expiry, uint256[2] anchorPrices, uint256 makerCollateral)",
  smt: "event Minted(address minter, address maker, address referral, uint256 totalCollateral,               uint256 expiry, uint256[2] anchorPrices, uint256 makerCollateral)",
  earn_smt: "event Minted(address minter, address maker, address referral, uint256 totalCollateral,               uint256 expiry, uint256[2] anchorPrices, uint256 makerCollateral, uint256 collateralAtRiskPercentage)",
  earn_dnt: "event Minted(address minter, address maker, address referral, uint256 totalCollateral, uint256 term, uint256 expiry, uint256[2] anchorPrices, uint256 makerCollateral, uint256 collateralAtRiskPercentage)",
}
const burnABIs = {
  vaultBurn: "event Burned(address operator, uint256 productId, uint256 amount, uint256 payoff)",
  vaultBurnBatch: "event BatchBurned(address operator, uint256[] productIds, uint256[] amounts, uint256[] payoffs)",
}
const automatorABIs = {
  automator2: "event ProductsBurned((address vault,(uint256 expiry,uint256[2] anchorPrices)[] products)[] products,uint256 totalCollateral,int256 fee,uint256 protocolFee)",
  automator1_5: "event ProductsBurned((address vault,(uint256 expiry,uint256[2] anchorPrices)[] products)[] products,uint256 totalCollateral,uint256 fee)",  //scrvusd
  automator1: "event ProductsBurned((address vault,(uint256 expiry,uint256[2] anchorPrices,uint256 collateralAtRiskPercentage)[] products)[] products,uint256 totalCollateral,uint256 fee)",  //usdt
}
const dualABIs = {
  dualBurn: "event Burned(address operator, uint256 productId, uint256 amount, uint256 collateralPayoff, uint256 quoteAssetPayoff, uint256 fee, uint256 quoteFee)",
  dualBurnBatch: "event BatchBurned(address operator, uint256[] productIds, uint256[] amounts, uint256[] collateralPayoffs, uint256[] quoteAssetPayoffs, uint256[] fees, uint256[] quoteFees)",
}

const feeRates = {
  tradingFeeRate: 15n, // 0.15%
  settlementFeeRate: 5n, // 0.05%
}

const startTimestamp = {
  [CHAIN.ETHEREUM]: 1717679579,
  [CHAIN.ARBITRUM]: 1717665701,
  [CHAIN.BSC]: 1726038205,
  [CHAIN.POLYGON]: 1733383076,
  [CHAIN.SEI]: 1739963336,
}

const vaultMakerAddr = "0xc59023d3fdd79fcee662d1f06eba0b1bfd49b8f3";
const contractsJsonFile = "https://raw.githubusercontent.com/sofa-org/sofa-gitbook/main/static/contracts_tokens_for_defillama_fees.json";
const methodology = {
  Fees: "Fees are collected, transferred to the mainnet, swapped to RCH, and then burned.",
}

let allContracts: any;
const fetch = async (options: FetchOptions) => {
  if (!allContracts) {
    allContracts = await getConfig('sofa-org/fees', contractsJsonFile);
  }
  const tokens = allContracts.tokens;
  const dailyFees = options.createBalances();
  const chain = options.chain;
  for (const product in allContracts[chain]) {
    const contractsInProduct = allContracts[chain][product];
    const eventAbi = mintABIs[product];
    for (const tokenSymbol in contractsInProduct) {
      let contracts = contractsInProduct[tokenSymbol];
      const token = tokens[chain][tokenSymbol];
      if (eventAbi) {
        //mint
        const data = await getLog(options, contracts, eventAbi);
        dailyFees.add(token, mintLog(data, product));
        //burn
        const dataBurn = await getLog(options, contracts, burnABIs.vaultBurn);
        dailyFees.add(token, burnLog(dataBurn, product));
        //burnBatch
        const dataBurnBatch = await getLog(options, contracts, burnABIs.vaultBurnBatch);
        dailyFees.add(token, burnBatchLog(dataBurnBatch, product));
      } else if (product === 'dual') {
        //burn
        const data = await getLog(options, contracts, dualABIs.dualBurn);
        const [collateral, quote] = getTokens(tokenSymbol, chain, tokens);
        const { fee, quoteFee } = burnDualLog(data, product);
        dailyFees.add(collateral, fee);
        dailyFees.add(quote, quoteFee);
        //burnBatch
        const dataBatch = await getLog(options, contracts, dualABIs.dualBurnBatch);
        const { fee: batchFee, quoteFee: batchQuoteFee } = burnBatchDualLog(dataBatch, product);
        dailyFees.add(collateral, batchFee);
        dailyFees.add(quote, batchQuoteFee);

      } else if (product.includes("automator")) {
        const burnAbi = automatorABIs[product];
        if (product === 'automator2') {
          contracts = await getAutomators(options, contracts[0]);
        }
        const data = await getLog(options, contracts, burnAbi);
        dailyFees.add(token, burnAutomatorLog(data, product));
      }
    }
  }
  //automator airdrop fee
  if (chain === CHAIN.ETHEREUM) {
    const logs = await options.getLogs({
      target: tokens[CHAIN.ETHEREUM].rch,
      eventAbi: 'event Transfer(address indexed from, address indexed to, uint256 value)'
    });
    logs.forEach(log => {
      if (log.from === "0xCc19E60c86C396929E76a6a488848C9596de22bd" && log.to === "0x4140AB4AFc36B93270a9659BD8387660cC6509b5") {
        dailyFees.add(tokens[CHAIN.ETHEREUM].rch, log.value);
      }
    });
  }
  return { dailyFees, dailyRevenue: dailyFees };
};

async function getAutomators(options: FetchOptions, factory: string) {
  try {
    const automatorsLength = await options.api.call({
      abi: 'function automatorsLength() view returns (uint256)',
      target: factory,
    });
    const arr = Array.from({ length: Number(automatorsLength) }, (_, i) => i);
    const addressList = await options.api.multiCall({
      calls: arr.map(no => ({ target: factory, params: [no] })),
      abi: 'function automators(uint256 no) view returns (address)',
    });
    return addressList;
  } catch (error) {
    //console.error("Error fetching automators:", error);
    return [];
  }
}

async function getLog(options: FetchOptions, targets: [], eventAbi: string) {
  const data = await options.getLogs({
    targets: targets,
    eventAbi: eventAbi,
  });
  return data;
}

function getTokens(raw: string, chain: string, tokens: any) {
  const tokenSymbols = raw.split('_');
  return tokenSymbols.map((token: string) => tokens[chain][token]);
}

function mintLog(data: any, product: any) {
  let fee = 0n;
  if (product === 'dnt' || product === 'smt') {
    data.forEach((log: any) => fee += (log.totalCollateral as bigint - log.makerCollateral) * feeRates.tradingFeeRate / 100n);
  } else if (product.includes('earn')) {
    data.forEach((log: any) => fee += (log.totalCollateral as bigint * log.collateralAtRiskPercentage - log.makerCollateral * 10n ** 18n) /
      (log.collateralAtRiskPercentage + 10n ** 20n / feeRates.tradingFeeRate));
  }
  return fee;
}

function burnLog(data: any, product: any) {
  let fee = 0n;
  if (product === 'dnt' || product === 'smt') {
    data.forEach((log: any) => fee += ((log.operator.toLowerCase() === vaultMakerAddr) ?
      0n : (log.payoff as bigint * feeRates.settlementFeeRate / (100n - feeRates.settlementFeeRate))));
  }
  return fee;
}

function burnBatchLog(data: any, product: any) {
  let fee = 0n;
  if (product === 'dnt' || product === 'smt') {
    data.forEach((log: any) => {
      if (log.operator.toLowerCase() !== vaultMakerAddr) {
        const totalPayoff = log.payoffs.reduce((acc: bigint, payoff: bigint) => acc + payoff, 0n);
        fee += totalPayoff / 19n;
      }
    });
  }
  return fee;
}

function burnAutomatorLog(data: any, product: any) {
  let fee = 0n;
  if (product === 'automator2') {
    data.forEach((log: any) => fee += log.protocolFee);
  } else {
    data.forEach((log: any) => fee += log.fee);
  }
  return fee;
}

function burnDualLog(data: any, product: any) {
  let fee = 0n;
  let quoteFee = 0n;
  data.forEach((log: any) => {
    fee += log.fee;
    quoteFee += log.quoteFee;
  });
  return { fee, quoteFee };
}

function burnBatchDualLog(data: any, product: any) {
  let fee = 0n;
  let quoteFee = 0n;
  data.forEach((log: any) => {
    fee += log.fees.reduce((acc: bigint, f: bigint) => acc + f, 0n);
    quoteFee += log.quoteFees.reduce((acc: bigint, f: bigint) => acc + f, 0n);
  });
  return { fee, quoteFee };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: startTimestamp[CHAIN.ETHEREUM], },
    [CHAIN.ARBITRUM]: { start: startTimestamp[CHAIN.ARBITRUM], },
    [CHAIN.BSC]: { start: startTimestamp[CHAIN.BSC], },
    [CHAIN.POLYGON]: { start: startTimestamp[CHAIN.POLYGON], },
    // [CHAIN.SEI]: { start: startTimestamp[CHAIN.SEI], },
  }
}

export default adapter;