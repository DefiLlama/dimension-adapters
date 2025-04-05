const logEvent = {
  anonymous: false,
  inputs: [
    {
      indexed: false,
      internalType: "uint256",
      name: "timestamp",
      type: "uint256",
    },
    {
      indexed: true,
      internalType: "bytes32",
      name: "key",
      type: "bytes32",
    },
    {
      components: [
        {
          components: [
            {
              components: [
                {
                  internalType: "string",
                  name: "key",
                  type: "string",
                },
                {
                  internalType: "bytes",
                  name: "value",
                  type: "bytes",
                },
              ],
              internalType: "struct EventUtils.BytesKeyValue[]",
              name: "items",
              type: "tuple[]",
            },
          ],
          internalType: "struct EventUtils.BytesItems",
          name: "list",
          type: "tuple",
        },
      ],
      indexed: false,
      internalType: "struct EventUtils.Log",
      name: "context",
      type: "tuple",
    },
    {
      components: [
        {
          components: [
            {
              components: [
                {
                  internalType: "string",
                  name: "key",
                  type: "string",
                },
                {
                  internalType: "bytes",
                  name: "value",
                  type: "bytes",
                },
              ],
              internalType: "struct EventUtils.BytesKeyValue[]",
              name: "items",
              type: "tuple[]",
            },
          ],
          internalType: "struct EventUtils.BytesItems",
          name: "list",
          type: "tuple",
        },
      ],
      indexed: false,
      internalType: "struct EventUtils.Log",
      name: "program",
      type: "tuple",
    },
  ],
  name: "Log",
  type: "event",
};

const abis = {
  returnEpochResultInActiveEpochByAddress:
    "function returnEpochResultInActiveEpochByAddress(address _bankrollIdentifierAddress) view returns ((uint256 totalPaidInNoRakeUSD, uint256 totalPaidInRakedUSD, uint256 totalPaidOutNoRakeUSD, uint256 totalPaidOutRakedUSD, uint256 totalPaidInAllTimeUSD, uint256 totalPaidOutAllTimeUSD, uint256 secondsLeftInEpoch) epochResult_)",
  returnBankrollTokenInfoByAddress:
    "function returnBankrollTokenInfoByAddress(address _bankrollIdentifierAddress) external view returns ((uint8 tokenType, address tokenAddress, string name, string symbol, uint8 decimals, uint256 totalAmount, uint256 priceInUSD, uint256 assetRatio, uint256 totalAmountInUsd) tokenInfo_)",
  getAllDataBatch:
    "function getAllDataBatch(address[] bankrollIndexes) view returns ((uint256 vaultIndex, address bankrollBytesIdentifier, address vaultAddress, address bankrollTokenAddress, address shareTokenAddress, address controllerAddress, address liquidityManagerAddress)[] vaultDetails_, (uint256 bankrollAmount, uint256 shareTokenAmount, uint256 epochAmount, uint256 totalAmount, uint256 totalAmountExcluding, uint64 bankrollTokenPrice, bool isProfitEpcoh, bool isProfitTotal, bool isProfitTotalExcluding)[] vaultAmounts_)",

  logEvent,
};

export default abis;
