const sdk = require('@defillama/sdk');
const pad = a => "0x" + "0".repeat(24) + a.toLowerCase().replace(/^0x/,'');
const TH = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const D = "0x34B504A5CF0fF41F8A480580533b6Dda687fa3Da";
const BUYBACK = "0xFfd3a57E8DB4f51FA01c72F06Ff30BDFDa9908e6";
const TREASW  = "0x3b99A4177E3f430590A8473f353dD87a5a2e1BfC";
const tokens = {
  lisUSD: "0x0782b6d8c4551B9760e74c0545a9bCD90bdc41E5",
  lista:  "0xFceB31A79F71AC9CBDCF853519c1b12D379EdC46",
  slisBNB:"0xb0b84d294e0c75a6abe60171b70edeb2efd14a1b",
  eth:    "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
  wbeth:  "0xa2E3356610840701BDf5611a53974510Ae27E2e1",
  usdt:   "0x55d398326f99059fF775485246999027B3197955",
};
(async () => {
  const latest = await sdk.api2.util.getLatestBlock('bsc');
  const to = latest.number; const from = to - 400000; // ~3.5 days at 0.75s
  console.log("block window", from, to);
  for (const [name, t] of Object.entries(tokens)) {
    try {
      const outs = await sdk.getEventLogs({ chain:'bsc', target:t, fromBlock:from, toBlock:to, topics:[TH, pad(D)] });
      const ins  = await sdk.getEventLogs({ chain:'bsc', target:t, fromBlock:from, toBlock:to, topics:[TH, null, pad(D)] });
      const by = {};
      let outTotal = 0n;
      for (const l of outs) { const dst = "0x"+l.topics[2].slice(26); by[dst]=(by[dst]||0n)+BigInt(l.data); outTotal+=BigInt(l.data); }
      let inTotal = 0n; for (const l of ins) inTotal += BigInt(l.data);
      const f = v => (Number(v)/1e18).toFixed(4);
      console.log(`\n${name}: IN ${f(inTotal)} (${ins.length} logs)  OUT ${f(outTotal)} (${outs.length} logs)`);
      for (const [dst,v] of Object.entries(by)) {
        const tag = dst.toLowerCase()===BUYBACK.toLowerCase()?"BUYBACK":dst.toLowerCase()===TREASW.toLowerCase()?"TREASURY_WALLET":"OTHER";
        console.log(`   -> ${dst} ${tag} ${f(v)}  share=${(Number(v)/Number(outTotal)*100).toFixed(2)}%`);
      }
    } catch(e){ console.log(name, "ERR", String(e.message).slice(0,100)); }
  }
})();
