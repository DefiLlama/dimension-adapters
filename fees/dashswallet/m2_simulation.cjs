/**
 * M.2 — Simulação temporária (regra "End-to-End Local Mocking" do plano
 * 2026-09-08_defillama-adapter-dynamic-swap-version-registry.md).
 *
 * Exercita o CÓDIGO REAL dos adapters (fees/dexs dashswallet) — `adapter.fetch`
 * -> `getContracts` -> guard -> observabilidade. `@defillama/sdk` (ChainApi/log) e
 * `helpers/cache` (getConfig/getCache) são interceptados no Module._load (antes do
 * adapter carregar), então nenhuma chamada de rede/S3 acontece.
 *
 * Cobre:
 *   (a) AC.3 — uma versão nova (V11) registrada no registry é capturada em `targets`.
 *   (c) parsing — endereço zero e retorno null (permitFailure) são filtrados.
 *   A.6 — a chegada de endereço ausente do snapshot S3 anterior emite o log de detecção
 *         (e o inverso: sem endereço novo, nenhum log).
 *   (b) AC.4 — falha de RPC do registry NÃO zera o dia: cai para FALLBACK_CONTRACTS + warn.
 *   (d) registry vazio (sem versões) e sem extras -> fallback ?? [] (não lança).
 *
 * Removido do diff antes do PR upstream (gate G.7). Rodar: `node fees/dashswallet/m2_simulation.cjs`
 */
require("ts-node").register({ transpileOnly: true, compilerOptions: { module: "commonjs" } });

const fs = require("fs");
const path = require("path");
const Module = require("module");

// ---- estado de cenário (mutável entre casos) ---------------------------
const scenario = { names: [], versionsByName: {}, callThrows: false, prevSnapshot: {} };
const logs = [];
const ZERO = "0x0000000000000000000000000000000000000000";
const V11 = "0xabcdef0000000000000000000000000000000011"; // versão nova fictícia (0x + 40 hex)

// ---- mock do @defillama/sdk (ChainApi + log), preservando o resto via Proxy ----
const realSdk = require("@defillama/sdk");
class MockChainApi {
    constructor({ chain }) {
        this.chain = chain;
    }
    async call() {
        if (scenario.callThrows) throw new Error("simulated registry RPC timeout");
        return scenario.names;
    }
    async multiCall({ calls }) {
        return calls.map((c) => scenario.versionsByName[c.params[0]] ?? null);
    }
}
const sdkProxy = new Proxy(realSdk, {
    get(t, p) {
        if (p === "ChainApi") return MockChainApi;
        if (p === "log") return (...a) => logs.push(a.join(" "));
        return t[p];
    },
});

// ---- mock do helpers/cache (getConfig emula o real; getCache = snapshot S3 anterior) ----
const cacheMock = {
    // getConfig real: roda o fetcher; se lançar/for vazio devolve {} (cache S3 vazio) — N2.
    getConfig: async (_project, _endpoint, { fetcher }) => {
        try {
            const json = await fetcher();
            if (!json) throw new Error("Invalid data");
            return json;
        } catch {
            return {};
        }
    },
    getCache: async (_key, projectChain) => scenario.prevSnapshot[projectChain.split("/")[1]] ?? {},
    setCache: async () => {},
};

// ---- interceptação no carregador de módulos ----------------------------
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === "@defillama/sdk") return sdkProxy;
    if (request.endsWith("helpers/cache")) return cacheMock;
    return origLoad.apply(this, arguments);
};

// ---- infra de asserção -------------------------------------------------
let failures = 0;
function check(name, cond, detail) {
    if (cond) console.log(`  ✓ ${name}`);
    else {
        failures++;
        console.log(`  ✗ ${name}${detail ? " — " + detail : ""}`);
    }
}

function parseFallbackEthereum(file) {
    const block = fs.readFileSync(file, "utf8").match(/FALLBACK_CONTRACTS[\s\S]*?\n};/)[0];
    const eth = block.match(/\[CHAIN\.ETHEREUM\]:\s*\[([\s\S]*?)\]/)[1];
    return [...eth.matchAll(/0x[0-9a-fA-F]{40}/g)].map((m) => m[0].toLowerCase());
}

function makeOptions(chain, captured) {
    return {
        chain,
        createBalances: () => ({ add: () => {} }),
        getLogs: async ({ targets }) => {
            captured.targets = targets.map((t) => t.toLowerCase());
            return [];
        },
    };
}

async function runForAdapter(label, relFile) {
    const abs = path.resolve(__dirname, relFile);
    const adapter = require(abs).default;
    const fallbackEth = parseFallbackEthereum(abs);
    const extrasEth = fallbackEth.slice(0, 3); // EXTRA ethereum = 3 primeiros do snapshot
    console.log(`\n=== ${label} (${relFile}) ===`);

    // (a)+(c)+A.6 — V11 capturada; zero/null filtrados; log de detecção citando o V11
    logs.length = 0;
    scenario.callThrows = false;
    scenario.names = ["colateralSwap", "debitSwap", "repay", "compoundSwap", "morphoSwap"];
    scenario.versionsByName = { colateralSwap: [V11, ZERO], debitSwap: null, repay: [], compoundSwap: [], morphoSwap: [] };
    scenario.prevSnapshot = { ethereum: extrasEth }; // snapshot anterior sem o V11
    let cap = {};
    await adapter.fetch(makeOptions("ethereum", cap));
    check("AC.3 — V11 presente em targets", cap.targets.includes(V11), JSON.stringify(cap.targets));
    check("(c) endereco zero filtrado", !cap.targets.includes(ZERO));
    check("(c) null (permitFailure) ignorado sem quebrar", cap.targets.length > 0);
    check("(a) extras legados preservados", extrasEth.every((a) => cap.targets.includes(a)));
    check(
        "A.6 — log de nova versao citando o V11",
        logs.some((l) => l.includes("Novo(s) contrato(s) detectado(s)") && l.includes(V11)),
        logs.join(" | ")
    );

    // A.6 negativo — snapshot ja contem tudo -> nenhum log de deteccao
    logs.length = 0;
    scenario.prevSnapshot = { ethereum: [V11, ...extrasEth] };
    cap = {};
    await adapter.fetch(makeOptions("ethereum", cap));
    check("A.6 — sem endereco novo, nenhum log", !logs.some((l) => l.includes("Novo(s) contrato(s) detectado(s)")), logs.join(" | "));

    // (b) AC.4 — falha de RPC -> guard -> FALLBACK_CONTRACTS + warn (dia nao zera)
    logs.length = 0;
    scenario.callThrows = true;
    scenario.prevSnapshot = {};
    cap = {};
    await adapter.fetch(makeOptions("ethereum", cap));
    const eq = cap.targets.length === fallbackEth.length && fallbackEth.every((a) => cap.targets.includes(a));
    check("AC.4 — targets == FALLBACK_CONTRACTS (dia nao zera)", eq, `got ${cap.targets.length}/${fallbackEth.length}`);
    check("AC.4 — warn de fallback logado", logs.some((l) => l.includes("usando FALLBACK_CONTRACTS")), logs.join(" | "));

    // (d) registry populado porem vazio + chain sem extras -> fallback ?? [] (nao lanca)
    logs.length = 0;
    scenario.callThrows = false;
    scenario.versionsByName = { colateralSwap: [], debitSwap: [], repay: [], compoundSwap: [], morphoSwap: [] };
    cap = {};
    await adapter.fetch(makeOptions("__no_extras_chain__", cap));
    check("(d) registry vazio + sem extras -> [] sem lancar", Array.isArray(cap.targets) && cap.targets.length === 0, JSON.stringify(cap.targets));
}

(async () => {
    await runForAdapter("FEES", "./index.ts");
    await runForAdapter("DEXS", "../../dexs/dashswallet/index.ts");
    console.log(`\n${failures === 0 ? "M.2 PASS ✅" : `M.2 FAIL ❌ (${failures} checks)`}`);
    Module._load = origLoad;
    process.exit(failures === 0 ? 0 : 1);
})();
