import { ethers } from "ethers";
import { queryDuneSql } from "./dune";
import { FetchOptions } from "../adapters/types";

const MATCH_ORDERS_ABI = `function matchOrders((address maker, ((bytes4 assetClass, bytes data) assetType, uint256 value) makeAsset, address taker, ((bytes4 assetClass, bytes data) assetType, uint256 value) takeAsset, uint256 salt, uint256 start, uint256 end, bytes4 dataType, bytes data) orderLeft, bytes signatureLeft, (address maker, ((bytes4 assetClass, bytes data) assetType, uint256 value) makeAsset, address taker, ((bytes4 assetClass, bytes data) assetType, uint256 value) takeAsset, uint256 salt, uint256 start, uint256 end, bytes4 dataType, bytes data) orderRight, bytes signatureRight) payable`;
const DIRECT_PURCHASE_ABI = `function directPurchase((address sellOrderMaker, uint256 sellOrderNftAmount, bytes4 nftAssetClass, bytes nftData, uint256 sellOrderPaymentAmount, address paymentToken, uint256 sellOrderSalt, uint256 sellOrderStart, uint256 sellOrderEnd, bytes4 sellOrderDataType, bytes sellOrderData, bytes sellOrderSignature, uint256 buyOrderPaymentAmount, uint256 buyOrderNftAmount, bytes buyOrderData) direct) payable`;
const DIRECT_ACCEPT_BID_ABI = `function directAcceptBid((address bidMaker, uint256 bidNftAmount, bytes4 nftAssetClass, bytes nftData, uint256 bidPaymentAmount, address paymentToken, uint256 bidSalt, uint256 bidStart, uint256 bidEnd, bytes4 bidDataType, bytes bidData, bytes bidSignature, uint256 sellOrderPaymentAmount, uint256 sellOrderNftAmount, bytes sellOrderData) direct) payable`;
const PROTOCOL_FEE_ABI = "function protocolFee() view returns (address receiver, uint48 buyerAmount, uint48 sellerAmount)";

const interfaces = {
  matchOrders: new ethers.Interface([MATCH_ORDERS_ABI]),
  directPurchase: new ethers.Interface([DIRECT_PURCHASE_ABI]),
  directAcceptBid: new ethers.Interface([DIRECT_ACCEPT_BID_ABI]),
  protocolFee: new ethers.Interface([PROTOCOL_FEE_ABI]),
};

const ETH_ASSET_CLASS = "0xaaaebeba"; // keccak256("ETH")
const NFT_CLASSES = new Set(["0x73ad2146", "0x973bb640"]); // [keccak256("ERC721"), keccak256("ERC1155")]

export const MATCH_ORDERS_ID = "0xe99a3f80";
export const DIRECT_PURCHASE_ID = "0x0d5f7d35";
export const DIRECT_ACCEPT_BID_ID = "0x67d49a3b";

function parseFeeBps(data: string): number {
  return parseInt(data.slice(-5), 16);
}

export function decodeMatchOrders(input: string) {
  const { orderLeft, orderRight } = interfaces.matchOrders.parseTransaction({ data: input })!.args;
  // payment token is whichever side is not an NFT — check left makeAsset first, then right
  const leftClass = orderLeft.makeAsset.assetType.assetClass;
  const isLeftNft = NFT_CLASSES.has(leftClass);
  let nftAsset;
  let payAsset;
  let seller;
  if (isLeftNft) {
    nftAsset = orderLeft.makeAsset;
    payAsset = orderRight.makeAsset;
    seller = orderLeft.maker;
  } else {
    nftAsset = orderRight.makeAsset;
    payAsset = orderLeft.makeAsset;
    seller = orderRight.maker;
  };
  const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["address", "uint256"], nftAsset.assetType.data);
  const nftContract: string = decoded[0];
  const nftTokenId: bigint = decoded[1];
  const payClass: string = payAsset.assetType.assetClass;
  let paymentToken: string;
  if (payClass === ETH_ASSET_CLASS) {
    paymentToken = ethers.ZeroAddress;
  } else {
    paymentToken = ethers.AbiCoder.defaultAbiCoder().decode(["address"], payAsset.assetType.data)[0];
  };
  const amount: bigint = payAsset.value;
  const originFeeBps = parseFeeBps(orderLeft.data) + parseFeeBps(orderRight.data);
  return { paymentToken, amount, seller, nftContract, nftTokenId, originFeeBps };
};

export function decodeDirectPurchase(input: string) {
  const { direct } = interfaces.directPurchase.parseTransaction({ data: input })!.args;
  const paymentToken: string = direct.paymentToken;
  const [nftContract, nftTokenId] = ethers.AbiCoder.defaultAbiCoder().decode(["address", "uint256"], direct.nftData);
  const originFeeBps = parseFeeBps(direct.sellOrderData) + parseFeeBps(direct.buyOrderData);
  return { paymentToken, amount: direct.buyOrderPaymentAmount as bigint, seller: direct.sellOrderMaker as string, nftContract, nftTokenId, originFeeBps };
};

export function decodeDirectAcceptBid(input: string) {
  const { direct } = interfaces.directAcceptBid.parseTransaction({ data: input })!.args;
  const [nftContract, nftTokenId] = ethers.AbiCoder.defaultAbiCoder().decode(["address", "uint256"], direct.nftData);
  const originFeeBps = parseFeeBps(direct.bidData) + parseFeeBps(direct.sellOrderData);
  return { paymentToken: direct.paymentToken as string, amount: direct.bidPaymentAmount as bigint, seller: "", nftContract, nftTokenId, originFeeBps };
};

export async function getDuneTrades(options: FetchOptions, exchange: string): Promise<any[]> {
  return queryDuneSql(options, `
    SELECT tx_hash, input
    FROM CHAIN.traces
    WHERE "to" = ${exchange}
      AND TIME_RANGE
      AND bytearray_substring(input, 1, 4) IN (${MATCH_ORDERS_ID}, ${DIRECT_PURCHASE_ID}, ${DIRECT_ACCEPT_BID_ID})
      AND call_type = 'call'
      AND success = true
  `);
};