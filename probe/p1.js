const sdk = require('@defillama/sdk');
(async () => {
  const d = "0x34B504A5CF0fF41F8A480580533b6Dda687fa3Da";
  for (const abi of ["uint128:distributeRate","uint256:distributeRate","address:revenueWallet","address:distributeTo","address:buyback","address:autoBuyback","uint256:RATE_DENOMINATOR","uint256:DENOMINATOR"]) {
    try { const r = await sdk.api2.abi.call({ chain:'bsc', target:d, abi }); console.log(abi, "=>", String(r)); }
    catch(e){ console.log(abi, "ERR", String(e.message).slice(0,70)); }
  }
})();
