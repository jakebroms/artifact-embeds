// GENERATED from bbr-deal-bot/frontend/lib/brrrr.ts (tsc --target es2020 --module es2015). Edit the .ts, then regenerate; do not hand-edit.
/**
 * BRRRR (Buy, Rehab, Rent, Refinance, Repeat) calculator math — v2.
 *
 * Pure functions only: no React, no DB, no DOM. This file is the single source
 * of truth for both calculators. The static copy on the artifacts site is this
 * file compiled to plain JavaScript (see artifact-embeds/brrrr-calculator).
 *
 * v2 changes, from the practitioner/lender audit:
 *   - Refi loan is sized the way DSCR lenders do it: gross rent ÷ PITIA, on the
 *     lesser of lease rent and appraiser market rent, capped by LTV on the
 *     appraised value (your ARV minus an appraisal cushion).
 *   - A second "cash-flow-safe" loan: the largest loan that still leaves a
 *     target monthly cash flow after full reserves.
 *   - You choose which loan to take (lender max, cash-flow safe, a custom
 *     amount, or none) and every output follows that choice.
 *   - Rehab contingency, refi costs as fixed + % of loan, lender reserves,
 *     taxes and insurance split, HOA, percent of capital recovered.
 *   - Leverage check: unlevered yield vs. the loan's mortgage constant.
 *   - Stress test: appraisal −10%, rehab +25%, rent −5% with 2 extra months.
 *
 * Conventions: percentages are fractions (0.75, not 75); money is unrounded.
 * "Cash left in" is positive when capital stays trapped, negative when the
 * refinance returns more than you put in.
 */
export const BRRRR_DEFAULTS = {
    purchasePrice: 80000,
    closingCosts: 3000,
    rehabCost: 40000,
    contingencyPct: 0.15,
    holdMonths: 8,
    monthlyHoldingCost: 1200,
    arv: 150000,
    appraisalCushionPct: 0.10,
    monthlyRent: 1750,
    marketRent: 0,
    vacancyPct: 0.05,
    maintenancePct: 0.08,
    capexPct: 0.06,
    mgmtPct: 0.08,
    taxesAnnual: 3400,
    insuranceAnnual: 1400,
    hoaMonthly: 0,
    refiLtv: 0.75,
    refiRate: 0.07,
    refiAmortYears: 30,
    minDscr: 1.2,
    refiClosingPct: 0.03,
    refiClosingFixed: 2000,
    reserveMonths: 6,
    loanMode: "lender",
    customLoan: 100000,
    targetCashLeft: 0,
    targetCashFlow: 150,
    targetYield: 0.07,
    resaleCostPct: 0.08, // RESALE_COST_PCT
    targetFlipProfit: 20000, // MIN_FLIP_PROFIT_B
};
/** Every numeric field. Used by the forms and URL (de)serialisation. */
export const NUMERIC_KEYS = [
    "purchasePrice", "closingCosts",
    "rehabCost", "contingencyPct", "holdMonths", "monthlyHoldingCost",
    "arv", "appraisalCushionPct",
    "monthlyRent", "marketRent", "vacancyPct", "maintenancePct", "capexPct", "mgmtPct",
    "taxesAnnual", "insuranceAnnual", "hoaMonthly",
    "refiLtv", "refiRate", "refiAmortYears", "minDscr", "refiClosingPct", "refiClosingFixed", "reserveMonths",
    "customLoan", "targetCashLeft", "targetCashFlow", "targetYield",
    "resaleCostPct", "targetFlipProfit",
];
/** Fractions in BrrrrInputs that forms and URLs show as whole percents. */
export const PERCENT_KEYS = new Set([
    "contingencyPct", "appraisalCushionPct", "vacancyPct", "maintenancePct", "capexPct", "mgmtPct",
    "refiLtv", "refiRate", "refiClosingPct", "targetYield", "resaleCostPct",
]);
export const LOAN_MODES = ["lender", "safe", "custom", "none"];
export function monthlyPayment(principal, annualRate, years) {
    const n = Math.max(1, Math.round(years * 12));
    const r = annualRate / 12;
    if (principal <= 0)
        return 0;
    if (r === 0)
        return principal / n;
    return (principal * r * (1 + r) ** n) / ((1 + r) ** n - 1);
}
export function principalForPayment(payment, annualRate, years) {
    const n = Math.max(1, Math.round(years * 12));
    const r = annualRate / 12;
    if (payment <= 0)
        return 0;
    if (r === 0)
        return payment * n;
    return (payment * ((1 + r) ** n - 1)) / (r * (1 + r) ** n);
}
function nz(n) {
    return Number.isFinite(n) ? n : 0;
}
export function sanitize(raw) {
    const i = { ...raw };
    for (const k of NUMERIC_KEYS)
        i[k] = nz(i[k]);
    if (!LOAN_MODES.includes(i.loanMode))
        i.loanMode = "lender";
    return i;
}
export function computeBrrrr(raw) {
    const i = sanitize(raw);
    // ── Buy + rehab ──────────────────────────────────────────────────────────
    const contingency = i.rehabCost * i.contingencyPct;
    const rehabTotal = i.rehabCost + contingency;
    const holdingCosts = i.holdMonths * i.monthlyHoldingCost;
    const allInCost = i.purchasePrice + i.closingCosts + rehabTotal + holdingCosts;
    // ── Value ────────────────────────────────────────────────────────────────
    const appraisedValue = Math.max(0, i.arv * (1 - i.appraisalCushionPct));
    // ── Operating ────────────────────────────────────────────────────────────
    const grossAnnualRent = i.monthlyRent * 12;
    const vacancyLoss = grossAnnualRent * i.vacancyPct;
    const effectiveGrossIncome = grossAnnualRent - vacancyLoss;
    const maintenance = grossAnnualRent * i.maintenancePct;
    const capex = grossAnnualRent * i.capexPct;
    const management = grossAnnualRent * i.mgmtPct;
    const taxesInsuranceHoa = i.taxesAnnual + i.insuranceAnnual + i.hoaMonthly * 12;
    const operatingExpenses = maintenance + capex + management + taxesInsuranceHoa;
    const noi = effectiveGrossIncome - operatingExpenses;
    const unleveredYield = allInCost > 0 ? noi / allInCost : null;
    // ── Loan sizing ──────────────────────────────────────────────────────────
    const pitiaOther = taxesInsuranceHoa / 12;
    const qualifyingRent = i.marketRent > 0 ? Math.min(i.monthlyRent, i.marketRent) : i.monthlyRent;
    const loanByLtv = Math.max(0, appraisedValue * i.refiLtv);
    let loanByDscr = Infinity;
    if (i.minDscr > 0) {
        const maxPi = Math.max(0, qualifyingRent / i.minDscr - pitiaOther);
        loanByDscr = principalForPayment(maxPi, i.refiRate, i.refiAmortYears);
    }
    let lenderLoan;
    let lenderLimiter;
    if (loanByLtv <= 0 && !(loanByDscr > 0)) {
        lenderLoan = 0;
        lenderLimiter = "none";
    }
    else if (loanByDscr < loanByLtv) {
        lenderLoan = loanByDscr;
        lenderLimiter = "dscr";
    }
    else {
        lenderLoan = loanByLtv;
        lenderLimiter = "ltv";
    }
    const maxPiSafe = Math.max(0, noi / 12 - i.targetCashFlow);
    const loanByCashFlow = principalForPayment(maxPiSafe, i.refiRate, i.refiAmortYears);
    const safeLoan = Math.min(lenderLoan, loanByCashFlow);
    const safeLimiter = loanByCashFlow < lenderLoan ? "cashflow" : "lender";
    // ── Chosen loan ──────────────────────────────────────────────────────────
    let refiLoan = 0;
    switch (i.loanMode) {
        case "lender":
            refiLoan = lenderLoan;
            break;
        case "safe":
            refiLoan = safeLoan;
            break;
        case "custom":
            refiLoan = Math.max(0, i.customLoan);
            break;
        case "none":
            refiLoan = 0;
            break;
    }
    const exceedsLender = i.loanMode === "custom" && refiLoan > lenderLoan + 0.5;
    const refiClosingCosts = refiLoan > 0 ? i.refiClosingFixed + refiLoan * i.refiClosingPct : 0;
    const netRefiProceeds = refiLoan - refiClosingCosts;
    const cashLeftIn = allInCost - netRefiProceeds;
    const capitalRecoveredPct = allInCost > 0 ? Math.max(0, netRefiProceeds) / allInCost : 0;
    const equityAfterRefi = appraisedValue - refiLoan;
    const payment = monthlyPayment(refiLoan, i.refiRate, i.refiAmortYears);
    const annualDebtService = payment * 12;
    const pitia = payment + pitiaOther;
    const reservesRequired = refiLoan > 0 ? i.reserveMonths * pitia : 0;
    // ── After refinance ──────────────────────────────────────────────────────
    const monthlyCashFlow = (noi - annualDebtService) / 12;
    const dscr = pitia > 0 && refiLoan > 0 ? i.monthlyRent / pitia : null;
    const cashOnCash = cashLeftIn > 0 ? (monthlyCashFlow * 12) / cashLeftIn : null;
    const mortgageConstant = monthlyPayment(1, i.refiRate, i.refiAmortYears) * 12;
    const leverageSpread = unleveredYield == null ? null : unleveredYield - mortgageConstant;
    // ── Pricing ──────────────────────────────────────────────────────────────
    // Neither loan nor NOI depends on purchase price, so both max offers are closed-form.
    const maoRefiRaw = netRefiProceeds + i.targetCashLeft - i.closingCosts - rehabTotal - holdingCosts;
    const maoRefi = refiLoan > 0 ? Math.max(0, maoRefiRaw) : null;
    const maoYieldRaw = i.targetYield > 0 ? noi / i.targetYield - i.closingCosts - rehabTotal - holdingCosts : 0;
    const maoYield = Math.max(0, maoYieldRaw);
    const usingRefi = refiLoan > 0;
    const mao = usingRefi ? maoRefi : maoYield;
    const priceVsMao = i.purchasePrice - (usingRefi ? maoRefiRaw : maoYieldRaw);
    const conventionalCashIn = i.purchasePrice * 0.25 + i.closingCosts + rehabTotal + holdingCosts;
    return {
        rehabTotal, contingency, holdingCosts, allInCost,
        appraisedValue,
        grossAnnualRent, vacancyLoss, effectiveGrossIncome, maintenance, capex, management,
        taxesInsuranceHoa, operatingExpenses, noi, unleveredYield,
        qualifyingRent, pitiaOther, loanByLtv,
        loanByDscr: Number.isFinite(loanByDscr) ? loanByDscr : loanByLtv,
        lenderLoan, lenderLimiter, safeLoan, safeLimiter,
        loanMode: i.loanMode, refiLoan, refiClosingCosts, netRefiProceeds, cashLeftIn, capitalRecoveredPct,
        equityAfterRefi, monthlyPayment: payment, annualDebtService, pitia, reservesRequired, exceedsLender,
        monthlyCashFlow, dscr, cashOnCash, mortgageConstant, leverageSpread,
        maoRefi, maoYield, mao, priceVsMao, conventionalCashIn,
    };
}
export function computeFlip(raw) {
    const i = sanitize(raw);
    const rehabTotal = i.rehabCost * (1 + i.contingencyPct);
    const holdingCosts = i.holdMonths * i.monthlyHoldingCost;
    const allInCost = i.purchasePrice + i.closingCosts + rehabTotal + holdingCosts;
    const fixed = i.closingCosts + rehabTotal + holdingCosts; // everything except the price
    const net = (sale) => sale * (1 - i.resaleCostPct);
    const salePrice = i.arv;
    const sellingCosts = salePrice * i.resaleCostPct;
    const profit = net(salePrice) - allInCost;
    const cushionedSalePrice = Math.max(0, i.arv * (1 - i.appraisalCushionPct));
    const cushionedProfit = net(cushionedSalePrice) - allInCost;
    const breakEvenSalePrice = i.resaleCostPct < 1 ? allInCost / (1 - i.resaleCostPct) : 0;
    const maoRaw = net(salePrice) - fixed - i.targetFlipProfit;
    const maoCushionedRaw = net(cushionedSalePrice) - fixed - i.targetFlipProfit;
    return {
        allInCost, salePrice, sellingCosts, profit,
        margin: salePrice > 0 ? profit / salePrice : null,
        roi: allInCost > 0 ? profit / allInCost : null,
        annualizedRoi: allInCost > 0 && i.holdMonths > 0 ? (profit / allInCost) * (12 / i.holdMonths) : null,
        cushionedSalePrice, cushionedProfit, breakEvenSalePrice,
        mao: Math.max(0, maoRaw),
        maoCushioned: Math.max(0, maoCushionedRaw),
        priceVsMao: i.purchasePrice - maoRaw,
    };
}
/** The same deal under each loan choice, for a side-by-side table. */
export function loanOptions(inputs) {
    const base = sanitize(inputs);
    const opts = [
        { mode: "none", label: "Hold free and clear", results: computeBrrrr({ ...base, loanMode: "none" }) },
        { mode: "safe", label: "Cash-flow-safe loan", results: computeBrrrr({ ...base, loanMode: "safe" }) },
        { mode: "lender", label: "Lender max loan", results: computeBrrrr({ ...base, loanMode: "lender" }) },
    ];
    if (base.loanMode === "custom") {
        opts.push({ mode: "custom", label: "Your custom loan", results: computeBrrrr({ ...base, loanMode: "custom" }) });
    }
    return opts;
}
/** Three things that most often break a BRRRR, applied one at a time. */
export function stressTest(inputs) {
    const b = sanitize(inputs);
    return [
        { key: "base", label: "As entered", detail: "", results: computeBrrrr(b) },
        { key: "appraisal", label: "Appraisal −10%", detail: "on top of your cushion",
            results: computeBrrrr({ ...b, arv: b.arv * 0.9 }) },
        { key: "rehab", label: "Rehab +25%", detail: "on top of contingency",
            results: computeBrrrr({ ...b, rehabCost: b.rehabCost * 1.25 }) },
        { key: "rent", label: "Rent −5%, +2 months", detail: "slower lease-up",
            results: computeBrrrr({ ...b, monthlyRent: b.monthlyRent * 0.95, marketRent: b.marketRent > 0 ? b.marketRent * 0.95 : 0, holdMonths: b.holdMonths + 2 }) },
    ];
}
const money = (n) => `${n < -0.5 ? "−" : ""}$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
const pct = (n, d = 1) => `${(n * 100).toFixed(d)}%`;
export function verdict(inputs, r) {
    const i = sanitize(inputs);
    const lender = computeBrrrr({ ...i, loanMode: "lender" });
    // Rental quality, before any debt.
    const y = r.unleveredYield ?? 0;
    const rental = y >= 0.08
        ? { tone: "good", text: `Strong rental on its own: ${pct(y)} unlevered yield on ${money(r.allInCost)} all-in.` }
        : y >= 0.06
            ? { tone: "warn", text: `Fair rental on its own: ${pct(y)} unlevered yield on ${money(r.allInCost)} all-in.` }
            : { tone: "bad", text: `Weak rental on its own: ${pct(y)} unlevered yield on ${money(r.allInCost)} all-in. Taxes, insurance and reserves take ${pct(r.grossAnnualRent > 0 ? r.operatingExpenses / r.grossAnnualRent : 0, 0)} of rent.` };
    // Does borrowing help?
    const spread = r.leverageSpread ?? 0;
    const leverage = spread >= 0.01
        ? { tone: "good", text: `Borrowing helps: the property earns ${pct(y)} and a ${pct(i.refiRate, 2)} loan costs ${pct(r.mortgageConstant)} a year in payments.` }
        : spread >= -0.01
            ? { tone: "warn", text: `Borrowing is roughly neutral: ${pct(y)} yield against a ${pct(r.mortgageConstant)} mortgage constant. Leverage adds risk without adding return.` }
            : { tone: "bad", text: `Borrowing hurts: the property earns ${pct(y)} but a ${pct(i.refiRate, 2)} loan costs ${pct(r.mortgageConstant)} a year in payments. Every dollar borrowed lowers your return.` };
    // How much of the capital comes back at the lender's max loan, and does it still cash flow?
    const rec = lender.capitalRecoveredPct;
    const cfOk = lender.monthlyCashFlow >= 0;
    const recText = `At the lender's max loan (${money(lender.lenderLoan)}) you recover ${pct(rec, 0)} of your cash`;
    const brrrr = rec >= 0.95 && cfOk
        ? { tone: "good", text: `${recText} and still cash flow ${money(lender.monthlyCashFlow)}/mo. A full BRRRR.` }
        : rec >= 0.5 && cfOk
            ? { tone: "good", text: `${recText} and still cash flow ${money(lender.monthlyCashFlow)}/mo. Practitioners call 50–70% back a win in today's rates.` }
            : rec >= 0.5
                ? { tone: "warn", text: `${recText}, but cash flow goes to ${money(lender.monthlyCashFlow)}/mo. Pulling max cash buys a negative-cash-flow rental.` }
                : cfOk
                    ? { tone: "warn", text: `${recText} (${money(lender.cashLeftIn)} stays in). Closer to a 25%-down rental than a BRRRR.` }
                    : { tone: "bad", text: `${recText} and cash flow goes to ${money(lender.monthlyCashFlow)}/mo. The rent does not support recycling capital here.` };
    // Price.
    const over = r.priceVsMao;
    const basis = r.refiLoan > 0
        ? `leave no more than ${money(i.targetCashLeft)} in after the refi`
        : `earn ${pct(i.targetYield, 0)} unlevered as a cash hold`;
    const price = over <= 0.5
        ? { tone: "good", text: `Your price of ${money(i.purchasePrice)} is ${over < -0.5 ? money(-over) + " under" : "right at"} the ${money(r.mao)} max offer to ${basis}.` }
        : over <= 10000
            ? { tone: "warn", text: `Your price of ${money(i.purchasePrice)} is ${money(over)} over the ${money(r.mao)} max offer to ${basis}. Negotiable range.` }
            : { tone: "bad", text: `Your price of ${money(i.purchasePrice)} is ${money(over)} over the ${money(r.mao)} max offer to ${basis}.` };
    // Flip, compared with holding.
    const f = computeFlip(i);
    const flipText = `Flipped at ${money(f.salePrice)} it clears ${money(f.profit)} (${pct(f.margin ?? 0, 0)} margin, ${pct(f.annualizedRoi ?? 0, 0)} annualized on cash)`;
    const flip = f.profit >= i.targetFlipProfit && f.cushionedProfit >= 0
        ? { tone: "good", text: `${flipText}, and still ${money(f.cushionedProfit)} if it only sells at ${money(f.cushionedSalePrice)}.` }
        : f.profit >= i.targetFlipProfit
            ? { tone: "warn", text: `${flipText}, but a sale at ${money(f.cushionedSalePrice)} loses ${money(-f.cushionedProfit)}. Thin for the risk.` }
            : f.profit > 0
                ? { tone: "warn", text: `${flipText}, under your ${money(i.targetFlipProfit)} target. Break-even sale is ${money(f.breakEvenSalePrice)}.` }
                : { tone: "bad", text: `Flipping loses ${money(-f.profit)} even at full ARV. Break-even sale is ${money(f.breakEvenSalePrice)}.` };
    return { rental, leverage, brrrr, price, flip };
}
// ── URL state ────────────────────────────────────────────────────────────────
// Short query keys so a saved link stays readable; only non-default values are
// written. v1 keys (reficlose, ti, basis) are still read for old links.
export const QUERY_KEYS = {
    purchasePrice: "price",
    closingCosts: "close",
    rehabCost: "rehab",
    contingencyPct: "cont",
    holdMonths: "hold",
    monthlyHoldingCost: "carry",
    arv: "arv",
    appraisalCushionPct: "cushion",
    monthlyRent: "rent",
    marketRent: "mrent",
    vacancyPct: "vac",
    maintenancePct: "maint",
    capexPct: "capex",
    mgmtPct: "mgmt",
    taxesAnnual: "tax",
    insuranceAnnual: "ins",
    hoaMonthly: "hoa",
    refiLtv: "ltv",
    refiRate: "rate",
    refiAmortYears: "amort",
    minDscr: "dscr",
    refiClosingPct: "refipct",
    refiClosingFixed: "refifix",
    reserveMonths: "reserves",
    customLoan: "loan",
    targetCashLeft: "maxleft",
    targetCashFlow: "cfmin",
    targetYield: "yield",
    resaleCostPct: "resale",
    targetFlipProfit: "profit",
};
export const MODE_QUERY_KEY = "mode";
function one(q, k) {
    const v = q[k];
    return Array.isArray(v) ? v[0] : v;
}
export function inputsFromQuery(query, base = BRRRR_DEFAULTS) {
    const out = { ...base };
    for (const key of NUMERIC_KEYS) {
        const text = one(query, QUERY_KEYS[key]);
        if (text == null || text === "")
            continue;
        const n = Number(text);
        if (!Number.isFinite(n))
            continue;
        out[key] = PERCENT_KEYS.has(key) ? n / 100 : n;
    }
    const mode = one(query, MODE_QUERY_KEY);
    if (mode && LOAN_MODES.includes(mode))
        out.loanMode = mode;
    // v1 compatibility
    const ti = Number(one(query, "ti"));
    if (one(query, "tax") == null && one(query, "ins") == null && Number.isFinite(ti) && one(query, "ti") !== "") {
        out.taxesAnnual = ti * 0.7;
        out.insuranceAnnual = ti * 0.3;
    }
    const reficlose = Number(one(query, "reficlose"));
    if (one(query, "refifix") == null && Number.isFinite(reficlose) && one(query, "reficlose") !== "") {
        out.refiClosingFixed = reficlose;
        out.refiClosingPct = 0;
    }
    return out;
}
export function queryFromInputs(inputs, base = BRRRR_DEFAULTS) {
    const params = new URLSearchParams();
    for (const key of NUMERIC_KEYS) {
        const v = inputs[key];
        if (v == null || !Number.isFinite(v) || v === base[key])
            continue;
        const shown = PERCENT_KEYS.has(key) ? v * 100 : v;
        params.set(QUERY_KEYS[key], String(Math.round(shown * 1000) / 1000));
    }
    if (inputs.loanMode != null && inputs.loanMode !== base.loanMode)
        params.set(MODE_QUERY_KEY, inputs.loanMode);
    return params;
}
/** Link to the calculator with some fields pre-filled (e.g. from a scraped property). */
export function brrrrHref(prefill) {
    const qs = queryFromInputs(prefill).toString();
    return qs ? `/brrrr?${qs}` : "/brrrr";
}
