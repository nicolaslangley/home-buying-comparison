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

// 2026 US federal income tax brackets for Married Filing Jointly (IRS Rev. Proc. 2025-32).
// Taxable income = gross - 401k - standard deduction ($32,200 MFJ for 2026).
function fedTaxMFJ(taxable: number): number {
  if (taxable <= 24800) return taxable * 0.10;
  if (taxable <= 100800) return 24800 * 0.10 + (taxable - 24800) * 0.12;
  if (taxable <= 211400) return 24800 * 0.10 + (100800 - 24800) * 0.12 + (taxable - 100800) * 0.22;
  if (taxable <= 403550) return 24800 * 0.10 + (100800 - 24800) * 0.12 + (211400 - 100800) * 0.22 + (taxable - 211400) * 0.24;
  if (taxable <= 512450) return 24800 * 0.10 + (100800 - 24800) * 0.12 + (211400 - 100800) * 0.22 + (403550 - 211400) * 0.24 + (taxable - 403550) * 0.32;
  if (taxable <= 768700) return 24800 * 0.10 + (100800 - 24800) * 0.12 + (211400 - 100800) * 0.22 + (403550 - 211400) * 0.24 + (512450 - 403550) * 0.32 + (taxable - 512450) * 0.35;
  return 24800 * 0.10 + (100800 - 24800) * 0.12 + (211400 - 100800) * 0.22 + (403550 - 211400) * 0.24 + (512450 - 403550) * 0.32 + (768700 - 512450) * 0.35 + (taxable - 768700) * 0.37;
}

// FICA = Social Security (6.2% up to $184,500 wage base) + Medicare (1.45% uncapped)
// + Additional Medicare (0.9% on household income over $250k for MFJ).
function fica(taxable: number): number {
  return Math.min(taxable, 184500) * 0.062 + taxable * 0.0145 + (taxable > 250000 ? (taxable - 250000) * 0.009 : 0);
}

// WA has no state income tax, so total tax = federal income tax + FICA.
// Savings target = gross * savingsPct minus already-invested 401k (to avoid double-counting).
export function calcWAIncome(income: WAIncome, settings: GlobalSettings): IncomeCalcs {
  const stdDeduction = 32200; // 2026 MFJ standard deduction
  const gross = income.salary1 + income.salary2;
  const totalDeductions = income.contribution401k1 + income.contribution401k2;
  const taxableIncome = Math.max(0, gross - totalDeductions - stdDeduction);
  const taxes = fedTaxMFJ(taxableIncome) + fica(taxableIncome);
  const netAnnual = gross - totalDeductions - taxes;
  const savingsTarget = gross * settings.targetSavingsPct - totalDeductions;

  return {
    grossHousehold: gross,
    monthlyGross: gross / 12,
    totalDeductions,
    taxableIncome,
    taxes,
    netAnnual,
    netMonthly: netAnnual / 12,
    savingsTarget,
    monthlySavingsTarget: savingsTarget / 12,
    fixedMonthlyExpenses: income.fixedMonthlyExpenses,
    childcareCosts: income.childcareCosts,
  };
}

// Total mortgage interest paid in the first 12 months.
function firstYearMortgageInterest(loanAmount: number, monthlyRate: number, nper: number): number {
  if (monthlyRate === 0 || loanAmount <= 0) return 0;
  const payment = pmt(monthlyRate, nper, loanAmount);
  let balance = loanAmount;
  let totalInterest = 0;
  for (let i = 0; i < 12; i++) {
    const interest = balance * monthlyRate;
    totalInterest += interest;
    balance -= (payment - interest);
  }
  return totalInterest;
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

  // Estimated annual federal tax savings from itemizing vs. standard deduction.
  // Deductible mortgage interest is capped at the first $750k of loan principal.
  // SALT (WA has no state income tax, so this is just property taxes) is capped at $10k/yr.
  const stdDeduction = 32200; // 2026 MFJ standard deduction
  const deductibleLoan = Math.min(loanAmount, 750000);
  const mortgageInterest = firstYearMortgageInterest(deductibleLoan, monthlyRate, duration);
  const saltDeduction = Math.min(prop.monthlyTaxes * 12, 10000);
  const itemized = mortgageInterest + saltDeduction;
  const extraDeduction = Math.max(0, itemized - stdDeduction);
  // Only federal income tax (not FICA) is affected by itemized deductions.
  const taxSavings = fedTaxMFJ(incomeCalcs.taxableIncome) - fedTaxMFJ(Math.max(0, incomeCalcs.taxableIncome - extraDeduction));
  const monthlyTaxSavings = taxSavings / 12;

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
    monthlyTaxSavings,
  };
}
