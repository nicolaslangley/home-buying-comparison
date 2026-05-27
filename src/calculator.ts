import type { WAIncome, BCIncome, Property, PropertyCalcs, IncomeCalcs, GlobalSettings } from './types';

// Excel PMT equivalent: computes fixed periodic payment for a loan.
// rate = periodic interest rate, nper = total periods, pv = loan principal.
export function pmt(rate: number, nper: number, pv: number): number {
  if (rate === 0) return pv / nper;
  return (rate * pv) / (1 - Math.pow(1 + rate, -nper));
}

// Excel PPMT equivalent: principal portion of the payment for period `per`.
// Derived by subtracting the interest accrued on the outstanding balance from the fixed payment.
function ppmt(rate: number, per: number, nper: number, pv: number): number {
  const payment = pmt(rate, nper, pv);
  const interest = pv * rate * Math.pow(1 + rate, per - 1) - (Math.pow(1 + rate, per - 1) - 1) * payment;
  return payment - interest;
}

// Average monthly principal paid over the first `months` payments.
// Mirrors the spreadsheet's =SUM(PPMT(...))/60 approach — early payments are mostly interest,
// so this understates long-run principal paydown but gives a conservative near-term figure.
export function avgMonthlyPrincipal(rate: number, nper: number, pv: number, months = 60): number {
  const monthlyRate = rate / 12;
  if (monthlyRate === 0) return pv / nper;
  let sum = 0;
  for (let i = 1; i <= months; i++) {
    sum += ppmt(monthlyRate, i, nper, pv);
  }
  return sum / months;
}

// 2024 US federal income tax brackets for Married Filing Jointly.
// Taxable income = gross - 401k - standard deduction ($29,200 MFJ for 2024).
function fedTaxMFJ(taxable: number): number {
  if (taxable <= 23200) return taxable * 0.10;
  if (taxable <= 94300) return 23200 * 0.10 + (taxable - 23200) * 0.12;
  if (taxable <= 201050) return 23200 * 0.10 + (94300 - 23200) * 0.12 + (taxable - 94300) * 0.22;
  if (taxable <= 383900) return 23200 * 0.10 + (94300 - 23200) * 0.12 + (201050 - 94300) * 0.22 + (taxable - 201050) * 0.24;
  if (taxable <= 487450) return 23200 * 0.10 + (94300 - 23200) * 0.12 + (201050 - 94300) * 0.22 + (383900 - 201050) * 0.24 + (taxable - 383900) * 0.32;
  if (taxable <= 731200) return 23200 * 0.10 + (94300 - 23200) * 0.12 + (201050 - 94300) * 0.22 + (383900 - 201050) * 0.24 + (487450 - 383900) * 0.32 + (taxable - 487450) * 0.35;
  return 23200 * 0.10 + (94300 - 23200) * 0.12 + (201050 - 94300) * 0.22 + (383900 - 201050) * 0.24 + (487450 - 383900) * 0.32 + (731200 - 487450) * 0.35 + (taxable - 731200) * 0.37;
}

// FICA = Social Security (6.2% up to $168,600 wage base) + Medicare (1.45% uncapped)
// + Additional Medicare (0.9% on income over $200k for single / $250k for MFJ).
// Applied to taxable income as an approximation; exact FICA applies to gross wages.
function fica(taxable: number): number {
  return Math.min(taxable, 168600) * 0.062 + taxable * 0.0145 + (taxable > 200000 ? (taxable - 200000) * 0.009 : 0);
}

// WA has no state income tax, so total tax = federal income tax + FICA.
// Savings target = gross * savingsPct minus already-invested 401k (to avoid double-counting).
export function calcWAIncome(income: WAIncome, settings: GlobalSettings): IncomeCalcs {
  const stdDeduction = 29200; // 2024 MFJ standard deduction
  const gross = income.salary1 + income.salary2;
  const totalDeductions = income.contribution401k1 + income.contribution401k2;
  const taxable = Math.max(0, gross - totalDeductions - stdDeduction);
  const taxes = fedTaxMFJ(taxable) + fica(taxable);
  const netAnnual = gross - totalDeductions - taxes;
  const savingsTarget = gross * settings.targetSavingsPct - totalDeductions;

  return {
    grossHousehold: gross,
    monthlyGross: gross / 12,
    totalDeductions,
    taxes,
    netAnnual,
    netMonthly: netAnnual / 12,
    savingsTarget,
    monthlySavingsTarget: savingsTarget / 12,
  };
}

// Canadian tax for one person: federal + BC provincial brackets, minus basic personal credits,
// plus CPP (Canada Pension Plan) and EI (Employment Insurance) premiums.
// Called separately for each partner so RRSP deductions are applied individually.
function bcFedTax(income: number, rrsp: number): number {
  const taxable = Math.max(0, income - rrsp);

  // 2024 federal brackets (CAD)
  let tax: number;
  if (taxable <= 55867) tax = taxable * 0.15;
  else if (taxable <= 111733) tax = 55867 * 0.15 + (taxable - 55867) * 0.205;
  else if (taxable <= 173205) tax = 55867 * 0.15 + (111733 - 55867) * 0.205 + (taxable - 111733) * 0.26;
  else if (taxable <= 246752) tax = 55867 * 0.15 + (111733 - 55867) * 0.205 + (173205 - 111733) * 0.26 + (taxable - 173205) * 0.29;
  else tax = 55867 * 0.15 + (111733 - 55867) * 0.205 + (173205 - 111733) * 0.26 + (246752 - 173205) * 0.29 + (taxable - 246752) * 0.33;

  const fedCredit = 15705 * 0.15; // basic personal amount credit reduces federal tax

  // 2024 BC provincial brackets (CAD)
  let provTax: number;
  if (taxable <= 47937) provTax = taxable * 0.0506;
  else if (taxable <= 95875) provTax = 47937 * 0.0506 + (taxable - 47937) * 0.077;
  else if (taxable <= 110076) provTax = 47937 * 0.0506 + (95875 - 47937) * 0.077 + (taxable - 95875) * 0.105;
  else if (taxable <= 133664) provTax = 47937 * 0.0506 + (95875 - 47937) * 0.077 + (110076 - 95875) * 0.105 + (taxable - 110076) * 0.1229;
  else if (taxable <= 181232) provTax = 47937 * 0.0506 + (95875 - 47937) * 0.077 + (110076 - 95875) * 0.105 + (133664 - 110076) * 0.1229 + (taxable - 133664) * 0.147;
  else provTax = 47937 * 0.0506 + (95875 - 47937) * 0.077 + (110076 - 95875) * 0.105 + (133664 - 110076) * 0.1229 + (181232 - 133664) * 0.147 + (taxable - 181232) * 0.168;

  const provCredit = 11981 * 0.0506; // BC basic personal amount credit

  // CPP: 5.95% on earnings between $3,500 exemption and $68,500 ceiling (2024)
  const cpp = Math.min(Math.max(income - 3500, 0), 68500) * 0.0595;
  // EI: 1.66% on insurable earnings up to $63,200 (2024)
  const ei = Math.min(income, 63200) * 0.0166;

  return tax - fedCredit + provTax - provCredit + cpp + ei;
}

// BC household tax = sum of each partner's individual Canadian tax liability.
// All values in CAD.
export function calcBCIncome(income: BCIncome, settings: GlobalSettings): IncomeCalcs {
  const tax1 = bcFedTax(income.salary1Cad, income.rrsp1);
  const tax2 = bcFedTax(income.salary2Cad, income.rrsp2);
  const totalTaxes = tax1 + tax2;
  const gross = income.salary1Cad + income.salary2Cad;
  const totalDeductions = income.rrsp1 + income.rrsp2;
  const netAnnual = gross - totalDeductions - totalTaxes;
  const savingsTarget = gross * settings.targetSavingsPct - totalDeductions;

  return {
    grossHousehold: gross,
    monthlyGross: gross / 12,
    totalDeductions,
    taxes: totalTaxes,
    netAnnual,
    netMonthly: netAnnual / 12,
    savingsTarget,
    monthlySavingsTarget: savingsTarget / 12,
  };
}

// All property monetary fields are in local currency (USD for WA, CAD for BC).
// When isBCUsd=true, income figures are converted from CAD to USD so percentages
// compare against the CAD property cost on an apples-to-apples basis.
export function calcProperty(
  prop: Property,
  incomeCalcs: IncomeCalcs,
  settings: GlobalSettings,
  isBCUsd = false,
  usdToCad = 1.37,
): PropertyCalcs {
  const monthlyRate = prop.interestRate / 12;
  const loanAmount = prop.cost - prop.downPayment1 - prop.downPayment2;
  const monthlyPI = pmt(monthlyRate, prop.durationMonths, loanAmount);
  const monthlyPrincipal = Math.abs(avgMonthlyPrincipal(prop.interestRate, prop.durationMonths, loanAmount));
  const totalMonthly = monthlyPI + prop.monthlyTaxes + prop.monthlyInsurance + prop.hoa;

  // For BC, income is in CAD and property cost is also in CAD, so no conversion needed.
  // isBCUsd is currently unused but kept for a future "enter BC income in USD" mode.
  const grossMonthly = isBCUsd ? incomeCalcs.monthlyGross / usdToCad : incomeCalcs.monthlyGross;
  const netMonthly = isBCUsd ? incomeCalcs.netMonthly / usdToCad : incomeCalcs.netMonthly;
  const savingsMonthly = isBCUsd ? incomeCalcs.monthlySavingsTarget / usdToCad : incomeCalcs.monthlySavingsTarget;

  // If principal counts as savings, reduce the required cash savings by the principal portion.
  const principalCredit = settings.includePrincipalInSavings ? monthlyPrincipal : 0;
  const effectiveSavings = savingsMonthly - principalCredit;

  const remainingIncome = netMonthly - totalMonthly - effectiveSavings;

  // 0.5% of purchase price annually is the standard rule-of-thumb for maintenance budgeting.
  const annualMaintenance = prop.cost * 0.005;

  // pctOnFixed: share of net income committed to non-discretionary spending.
  // Includes housing (totalMonthly), savings target, maintenance reserve, and any other fixed costs.
  const pctOnFixed =
    (prop.fixedMonthlyExpenses + prop.childcareCosts + annualMaintenance / 12 + totalMonthly + savingsMonthly) /
    netMonthly;
  const remainingDiscretionary = netMonthly * (1 - pctOnFixed);

  return {
    loanAmount,
    monthlyPI,
    monthlyPrincipal,
    totalMonthly,
    pctOfGross: totalMonthly / grossMonthly,
    pctOfNet: totalMonthly / netMonthly,
    remainingIncome,
    annualMaintenance,
    pctOnFixed,
    remainingDiscretionary,
  };
}
