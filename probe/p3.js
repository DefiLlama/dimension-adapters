const sdk = require('@defillama/sdk');
const pad = a => "0x" + "0".repeat(24) + a.toLowerCase().replace(/^0x/,'');
const TH = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const LISTA = "0xFceB31A79F71AC9CBDCF853519c1b12D379EdC46";
const RTBUY = "0xD08BE4Fe91E5786CeC1D3Bce58c2A16c3efcA179";
const VEDIST = "0xE4153Eb04417bE05b8d6B2222E4Cdd8AE674ee76";
const DEAD  = "0x000000000000000000000000000000000000dEaD";
const f = v => (Number(v)/1e18).toLocaleString('en-US',{maximumFractionDigits:0});
(async () => {
  const latest = await sdk.api2.util.getLatestBlock('bsc');
  const to = latest.number;
  // go back ~6 months: BSC had 3s then 0.75s. use a generous 12M blocks
  const from = to - 12000000;
  console.log("window", from, to, "latest ts", latest.timestamp);
  const cases = [
    ["realtimeBuyback -> dead", pad(RTBUY), pad(DEAD)],
    ["realtimeBuyback -> *   ", pad(RTBUY), null],
    ["veListaDist     -> dead", pad(VEDIST), pad(DEAD)],
    ["*               -> dead", null, pad(DEAD)],
  ];
  for (const [name, a, b] of cases) {
    try {
      const logs = await sdk.getEventLogs({ chain:'bsc', target:LISTA, fromBlock:from, toBlock:to, topics:[TH, a, b] });
      let tot=0n; const byDst={}; const byMonth={};
      for (const l of logs) { tot+=BigInt(l.data); const d="0x"+l.topics[2].slice(26); byDst[d]=(byDst[d]||0n)+BigInt(l.data);
        byMonth[l.blockNumber]= (byMonth[l.blockNumber]||0n)+BigInt(l.data); }
      console.log(`\n${name}: ${logs.length} logs, total ${f(tot)} LISTA`);
      const blocks = Object.keys(byMonth).map(Number).sort((x,y)=>x-y);
      if (logs.length && logs.length<=40) for (const bn of blocks) console.log(`    block ${bn} ${f(byMonth[bn])}`);
      else if (logs.length) { console.log("    first/last blocks:", blocks[0], blocks[blocks.length-1]);
        for (const [d,v] of Object.entries(byDst)) console.log(`    -> ${d} ${f(v)}`); }
    } catch(e){ console.log(name,"ERR",String(e.message).slice(0,90)); }
  }
})();
