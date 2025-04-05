import { ethers } from "ethers";

type Receipt = {
  payin: bigint;
  payout: bigint;
  receipent: string;
  token: string;
  bankroll: string;
};

function receiptDecode(receipt: string): Receipt {
  const abiCoder = new ethers.AbiCoder();
  const values = abiCoder.decode(
    [
      "uint128", // payin
      "uint128", // payout
      "address", // receipent
      "address", // token
      "address", // bankroll
    ],
    receipt
  );

  return {
    payin: BigInt(values[0]),
    payout: BigInt(values[1]),
    receipent: values[2],
    token: values[3],
    bankroll: values[4],
  };
}

function extractReceiptHashes(data) {
  let hashes = [];

  function traverse(arr) {
    if (!Array.isArray(arr)) return;

    for (const item of arr) {
      if (
        Array.isArray(item) &&
        item.length === 2 &&
        item[0] === "Receipt" &&
        typeof item[1] === "string" &&
        item[1].startsWith("0x")
      ) {
        hashes.push(item[1] as never);
      }
    }
  }

  traverse(data);
  return hashes;
}

export { receiptDecode, extractReceiptHashes };