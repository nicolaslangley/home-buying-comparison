import type { WAIncome, Property, PropertyCalcs, IncomeCalcs, GlobalSettings } from './types';

// Excel PMT equivalent: computes fixed periodic payment for a loan.
// rate = periodic interest rate, nper = total periods, pv = loan principal.
export function pmt(rate: number, nper: number, pv: number): number {
  if (rate === 0) return pv / nper;
  return (rate * pv) / (1 - Math.pow(1 + rate, -nper));
}

// Excel PPMT equivalent: principal portion of the payment for period `per`.
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
// + Additional Medicare (0.9% on income over $200k).
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
    fixedMonthlyExpenses: income.fixedMonthlyExpenses,
    childcareCosts: income.childcareCosts,
  };
}

export function calcProperty(
  prop: Property,
  incomeCalcs: IncomeCalcs,
  settings: GlobalSettings,
): PropertyCalcs {
  const rate = prop.interestRate ?? settings.defaultInterestRate;
  const duration = prop.durationMonths ?? settings.defaultDurationMonths;
  const monthlyRate = rate / 12;
  const totalDown = (prop.downPayment ?? settings.defaultDownPayment) + prop.additionalFunds;
  const loanAmount = prop.cost - totalDown;
  const monthlyPI = pmt(monthlyRate, duration, loanAmount);
  const monthlyPrincipal = Math.abs(avgMonthlyPrincipal(rate, duration, loanAmount));
  const totalMonthly = monthlyPI + prop.monthlyTaxes + prop.monthlyInsurance + prop.hoa;

  // If principal counts as savings, reduce the required cash savings by the principal portion.
  const principalCredit = settings.includePrincipalInSavings ? monthlyPrincipal : 0;
  const effectiveSavings = incomeCalcs.monthlySavingsTarget - principalCredit;

  const remainingIncome = incomeCalcs.netMonthly - totalMonthly - effectiveSavings;

  const annualMaintenance = prop.cost * (prop.maintenancePct ?? 0.005);

  // pctOnFixed: share of net income committed to non-discretionary spending.
  const pctOnFixed =
    (incomeCalcs.fixedMonthlyExpenses + incomeCalcs.childcareCosts + annualMaintenance / 12 + totalMonthly + incomeCalcs.monthlySavingsTarget) /
    incomeCalcs.netMonthly;
  const remainingDiscretionary = incomeCalcs.netMonthly * (1 - pctOnFixed);

  return {
    totalDown,
    loanAmount,
    monthlyPI,
    monthlyPrincipal,
    totalMonthly,
    pctOfGross: totalMonthly / incomeCalcs.monthlyGross,
    pctOfNet: totalMonthly / incomeCalcs.netMonthly,
    remainingIncome,
    annualMaintenance,
    pctOnFixed,
    remainingDiscretionary,
  };
}
