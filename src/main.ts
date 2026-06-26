import './style.css';
import { calcWAIncome, calcProperty } from './calculator';
import type { GlobalSettings, WAIncome, Property, IncomeCalcs, PropertyCalcs } from './types';

// --- State ---
// All mutable state lives here as plain objects. No framework — changes trigger
// targeted DOM updates (income results, property result panels) or a full re-render
// (add/remove property). Full re-renders are cheap because inputs are few.

const settings: GlobalSettings = {
  targetSavingsPct: 0.25,
  targetHousingPct: 0.30,
  targetLeftoverSpending: 9000,
  includePrincipalInSavings: false,
  defaultInterestRate: 0.065,
  defaultDownPayment: 0,
  defaultDurationMonths: 360,
};

const income: WAIncome = {
  partner1Name: 'Partner 1',
  partner2Name: 'Partner 2',
  salary1: 0,
  salary2: 0,
  contribution401k1: 0,
  contribution401k2: 0,
  fixedMonthlyExpenses: 0,
  childcareCosts: 0,
};

let properties: Property[] = [];
let nextId = 1;
let pendingSharedProperty: Property | null = null;

function newProperty(): Property {
  return {
    id: String(nextId++),
    name: '',
    listingUrl: '',
    photoUrl: '',
    cost: 0,
    downPayment: null,
    additionalFunds: 0,
    interestRate: null,
    durationMonths: null,
    monthlyTaxes: 0,
    monthlyInsurance: 0,
    hoa: 0,
    maintenancePct: null,
  };
}

// --- Formatting ---

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

// Returns CSS class for color-coded badges: good (≤warn), warn (warn..bad], bad (>bad).
function badgeClass(n: number, warn: number, bad: number) {
  if (n <= warn) return 'badge-good';
  if (n <= bad) return 'badge-warn';
  return 'badge-bad';
}

// --- Finances section ---

function renderIncomeInputs() {
  return `
    <div class="income-card">
      <h3>Income &amp; Deductions</h3>
      <div class="partner-names">
        <input class="partner-name-input" type="text" data-income="partner1Name"
          value="${income.partner1Name}" placeholder="Partner 1">
        <input class="partner-name-input" type="text" data-income="partner2Name"
          value="${income.partner2Name}" placeholder="Partner 2">
      </div>
      <div class="income-inputs-grid">
        <div class="field">
          <label><span data-partner-name="1">${income.partner1Name}</span> Gross Salary</label>
          <input type="number" data-income="salary1" value="${income.salary1 || ''}" placeholder="0" min="0" step="1000">
        </div>
        <div class="field">
          <label><span data-partner-name="2">${income.partner2Name}</span> Gross Salary</label>
          <input type="number" data-income="salary2" value="${income.salary2 || ''}" placeholder="0" min="0" step="1000">
        </div>
        <div class="field">
          <label><span data-partner-name="1">${income.partner1Name}</span> 401k</label>
          <input type="number" data-income="contribution401k1" value="${income.contribution401k1 || ''}" placeholder="0" min="0" step="500">
        </div>
        <div class="field">
          <label><span data-partner-name="2">${income.partner2Name}</span> 401k</label>
          <input type="number" data-income="contribution401k2" value="${income.contribution401k2 || ''}" placeholder="0" min="0" step="500">
        </div>
      </div>
    </div>`;
}

function renderLoanDefaults() {
  return `
    <div class="income-card">
      <h3>Loan Details</h3>
      <div class="income-inputs-grid">
        <div class="field">
          <label>Interest Rate (%)</label>
          <input type="number" id="s-interest-rate" value="${(settings.defaultInterestRate * 100).toFixed(3)}" min="0" max="20" step="0.01">
        </div>
        <div class="field">
          <label>Down Payment</label>
          <input type="number" id="s-down-payment" value="${settings.defaultDownPayment || ''}" placeholder="0" min="0" step="1">
        </div>
        <div class="field">
          <label>Loan Term (months)</label>
          <input type="number" id="s-duration" value="${settings.defaultDurationMonths}" min="60" max="480" step="1">
        </div>
      </div>
    </div>`;
}

function renderMonthlyExpenses() {
  return `
    <div class="income-card">
      <h3>Monthly Expenses</h3>
      <div class="income-inputs-grid">
        <div class="field">
          <label>Fixed Monthly Expenses</label>
          <input type="number" data-income="fixedMonthlyExpenses" value="${income.fixedMonthlyExpenses || ''}" placeholder="0" min="0" step="1">
        </div>
        <div class="field">
          <label>Childcare / mo</label>
          <input type="number" data-income="childcareCosts" value="${income.childcareCosts || ''}" placeholder="0" min="0" step="1">
        </div>
      </div>
    </div>`;
}

function renderTargets() {
  return `
    <div class="income-card">
      <h3>Targets</h3>
      <div class="settings-grid">
        <div class="settings-field">
          <label>Savings target (% gross)</label>
          <input type="number" id="s-savings-pct" value="${(settings.targetSavingsPct * 100).toFixed(0)}" min="0" max="100" step="1">
        </div>
        <div class="settings-field">
          <label>Housing target (% gross)</label>
          <input type="number" id="s-housing-pct" value="${(settings.targetHousingPct * 100).toFixed(0)}" min="0" max="100" step="1">
        </div>
        <div class="settings-field">
          <label>Leftover spending / mo</label>
          <input type="number" id="s-leftover" value="${settings.targetLeftoverSpending}" min="0" step="1">
        </div>
        <div class="toggle-field">
          <span class="toggle-label">Principal counts as savings</span>
          <div class="toggle-row">
            <input type="checkbox" id="s-principal" ${settings.includePrincipalInSavings ? 'checked' : ''}>
            <label for="s-principal" style="font-size:0.875rem">Include principal</label>
          </div>
        </div>
      </div>
    </div>`;
}

function renderIncomeResults(calcs: IncomeCalcs) {
  return `
    <div class="income-card" id="income-results">
      <h3>Calculated</h3>
      <div class="result-row">
        <span class="result-label">Household Gross</span>
        <span class="result-value">${usd.format(calcs.grossHousehold)}</span>
      </div>
      <div class="result-row">
        <span class="result-label">Total Pre-tax Deductions</span>
        <span class="result-value">${usd.format(calcs.totalDeductions)}</span>
      </div>
      <div class="result-row">
        <span class="result-label">Est. Taxes</span>
        <span class="result-value">${usd.format(calcs.taxes)}</span>
      </div>
      <div class="result-row highlight">
        <span class="result-label">Net Annual</span>
        <span class="result-value">${usd.format(calcs.netAnnual)}</span>
      </div>
      <div class="result-row highlight">
        <span class="result-label">Net Monthly</span>
        <span class="result-value">${usd.format(calcs.netMonthly)}</span>
      </div>
      <div class="result-row">
        <span class="result-label">Monthly Savings Target</span>
        <span class="result-value">${usd.format(calcs.monthlySavingsTarget)}</span>
      </div>
    </div>`;
}

// --- Property card ---

function renderPropertyCard(prop: Property) {
  return `
    <div class="property-card" data-id="${prop.id}">
      ${prop.photoUrl ? `<div class="property-photo"><img src="${prop.photoUrl}" alt="Property photo" loading="lazy"></div>` : ''}
      <div class="property-card-header">
        <input class="property-name-input" type="text" placeholder="Property name / address"
          data-prop-field="name" value="${prop.name}">
        ${prop.listingUrl ? `<a class="listing-link" href="${prop.listingUrl}" target="_blank" rel="noopener">View listing ↗</a>` : ''}
        <button class="btn-share" data-share-id="${prop.id}" title="Copy share link">Share</button>
        <button class="btn-remove" data-remove-id="${prop.id}" title="Remove">×</button>
      </div>
      <div class="property-card-body">
        <div class="property-inputs">
          <div class="property-inputs-section-title">Details</div>
          <div class="property-inputs-grid">
            <div class="field">
              <label>Purchase Price</label>
              <input type="number" data-prop-field="cost" value="${prop.cost || ''}" placeholder="0" min="0" step="1">
            </div>
            <div class="field">
              <label>Down Payment</label>
              <input type="number" data-prop-field="downPayment"
                value="${prop.downPayment !== null ? prop.downPayment : ''}"
                placeholder="${usd.format(settings.defaultDownPayment)}" min="0" step="1">
            </div>
            <div class="field">
              <label>Interest Rate (%)</label>
              <input type="number" data-prop-field="interestRate"
                value="${prop.interestRate !== null ? (prop.interestRate * 100).toFixed(3) : ''}"
                placeholder="${(settings.defaultInterestRate * 100).toFixed(3)}" min="0" max="20" step="0.125">
            </div>
            <div class="field">
              <label>Monthly Taxes</label>
              <input type="number" data-prop-field="monthlyTaxes" value="${prop.monthlyTaxes || ''}" placeholder="0" min="0" step="1">
            </div>
            <div class="field">
              <label>Insurance / mo</label>
              <input type="number" data-prop-field="monthlyInsurance" value="${prop.monthlyInsurance || ''}" placeholder="0" min="0" step="1">
            </div>
            <div class="field">
              <label>HOA / mo</label>
              <input type="number" data-prop-field="hoa" value="${prop.hoa || ''}" placeholder="0" min="0" step="1">
            </div>
            <div class="field">
              <label>Maintenance (%)</label>
              <input type="number" data-prop-field="maintenancePct"
                value="${prop.maintenancePct !== null ? (prop.maintenancePct * 100).toFixed(1) : ''}"
                placeholder="0.5" min="0" max="10" step="0.1">
            </div>
          </div>
          <div class="url-field url-field--spaced">
            <input type="url" placeholder="Listing URL"
              data-prop-field="listingUrl" value="${prop.listingUrl}">
            <input type="url" placeholder="Photo URL"
              data-prop-field="photoUrl" value="${prop.photoUrl}">
          </div>
        </div>
        <div class="property-results" id="results-${prop.id}">
          <p class="results-empty">Enter details to see calculations.</p>
        </div>
      </div>
    </div>`;
}

function renderPropertyResults(prop: Property, calcs: PropertyCalcs) {
  const housingPctClass = badgeClass(calcs.pctOfGross, settings.targetHousingPct, settings.targetHousingPct + 0.05);
  const remainClass = calcs.remainingIncome >= settings.targetLeftoverSpending ? 'badge-good'
    : calcs.remainingIncome >= settings.targetLeftoverSpending * 0.8 ? 'badge-warn' : 'badge-bad';
  const discClass = calcs.remainingDiscretionary >= 3000 ? 'badge-good'
    : calcs.remainingDiscretionary >= 1500 ? 'badge-warn' : 'badge-bad';

  const fixedPct = calcs.pctOnFixed;
  const fixedClass = fixedPct <= 0.75 ? 'badge-good' : fixedPct <= 0.80 ? 'badge-warn' : 'badge-bad';
  const fixedLabel = fixedPct <= 0.75 ? 'You can do this'
    : fixedPct <= 0.80 ? 'Proceed with caution'
    : fixedPct <= 0.85 ? 'Go back and see where you can cut costs'
    : 'Financial stress overload';

  const downPct = prop.cost > 0 ? calcs.totalDown / prop.cost : 0;

  return `
    <div class="result-group">
      <div class="result-group-title">Loan</div>
      <div class="result-row">
        <span class="result-label">Interest Rate</span>
        <span class="result-value">${pct(prop.interestRate ?? settings.defaultInterestRate)}</span>
      </div>
      <div class="result-row">
        <span class="result-label">Down Payment</span>
        <span class="result-value">
          ${usd.format(calcs.totalDown)}
          <span class="result-sub">${pct(downPct)} of price</span>
        </span>
      </div>
      <div class="result-row">
        <span class="result-label">Loan Amount</span>
        <span class="result-value">${usd.format(calcs.loanAmount)}</span>
      </div>
    </div>
    <div class="result-group">
      <div class="result-group-title">Monthly Costs</div>
      <div class="result-row">
        <span class="result-label">Principal &amp; Interest</span>
        <span class="result-value">${usd.format(calcs.monthlyPI)}</span>
      </div>
      <div class="result-row">
        <span class="result-label">Taxes + Insurance + HOA</span>
        <span class="result-value">${usd.format(prop.monthlyTaxes + prop.monthlyInsurance + prop.hoa)}</span>
      </div>
      <div class="result-row highlight">
        <span class="result-label">Total Monthly</span>
        <span class="result-value">${usd.format(calcs.totalMonthly)}</span>
      </div>
    </div>
    <div class="result-group">
      <div class="result-group-title">Affordability</div>
      <div class="result-row">
        <span class="result-label">% of Gross</span>
        <span class="result-value">
          <span class="badge ${housingPctClass}">${pct(calcs.pctOfGross)}</span>
          <span class="result-sub">target ≤ ${pct(settings.targetHousingPct)}</span>
        </span>
      </div>
      <div class="result-row">
        <span class="result-label">% of Net</span>
        <span class="result-value">${pct(calcs.pctOfNet)}</span>
      </div>
      <div class="result-row">
        <span class="result-label">Remaining (after housing + savings)</span>
        <span class="result-value">
          <span class="badge ${remainClass}">${usd.format(calcs.remainingIncome)}/mo</span>
        </span>
      </div>
    </div>
    <div class="result-group">
      <div class="result-group-title">Full Budget</div>
      <div class="result-row">
        <span class="result-label">Annual Maintenance (${pct(prop.maintenancePct ?? 0.005)})</span>
        <span class="result-value">${usd.format(calcs.annualMaintenance)}/yr</span>
      </div>
      <div class="result-row">
        <span class="result-label">% on Fixed Costs</span>
        <span class="result-value">
          <span class="badge ${fixedClass}">${pct(fixedPct)}</span>
          <span class="result-sub">${fixedLabel}</span>
        </span>
      </div>
      <div class="result-row highlight">
        <span class="result-label">Remaining Discretionary</span>
        <span class="result-value">
          <span class="badge ${discClass}">${usd.format(calcs.remainingDiscretionary)}/mo</span>
        </span>
      </div>
    </div>`;
}

// --- Add Property modal ---

function renderAddPropertyModal() {
  const defaultRate = (settings.defaultInterestRate * 100).toFixed(3);
  const defaultDuration = settings.defaultDurationMonths;

  return `
    <div class="modal-overlay" id="add-prop-modal">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-header">
          <h2 id="modal-title">Add Property</h2>
          <button class="modal-close" id="modal-close" aria-label="Close">×</button>
        </div>
        <form class="modal-form" id="add-prop-form">
          <div class="modal-section-title">Property</div>
          <div class="modal-grid">
            <div class="field modal-field-wide">
              <label>Name / Address</label>
              <input type="text" name="name" placeholder="123 Main St" autocomplete="off">
            </div>
            <div class="field modal-field-wide">
              <label>Listing URL <span class="field-optional">(optional)</span></label>
              <input type="url" name="listingUrl" placeholder="Redfin or Zillow URL">
            </div>
            <div class="field modal-field-wide">
              <label>Photo URL <span class="field-optional">(optional — right-click listing photo → Copy image address)</span></label>
              <input type="url" name="photoUrl" placeholder="https://…">
            </div>
            <div class="field">
              <label>Purchase Price</label>
              <input type="number" name="cost" placeholder="0" min="0" step="1">
            </div>
            <div class="field">
              <label>Monthly Taxes</label>
              <input type="number" name="monthlyTaxes" placeholder="0" min="0" step="1">
            </div>
            <div class="field">
              <label>Monthly Insurance</label>
              <input type="number" name="monthlyInsurance" placeholder="0" min="0" step="1">
            </div>
            <div class="field">
              <label>HOA / mo</label>
              <input type="number" name="hoa" placeholder="0" min="0" step="1">
            </div>
            <div class="field">
              <label>Annual Maintenance (%)</label>
              <input type="number" name="maintenancePct" placeholder="0.5" min="0" max="10" step="0.1">
            </div>
          </div>
          <div class="modal-section-title">Loan Details <span class="field-optional">— leave blank to use defaults</span></div>
          <div class="modal-grid">
            <div class="field">
              <label>Down Payment</label>
              <input type="number" name="downPayment" placeholder="${usd.format(settings.defaultDownPayment)}" min="0" step="1">
            </div>
            <div class="field">
              <label>Additional Funds</label>
              <input type="number" name="additionalFunds" placeholder="0" min="0" step="1">
            </div>
            <div class="field">
              <label>Interest Rate (%)</label>
              <input type="number" name="interestRate" placeholder="${defaultRate}" min="0" max="20" step="0.01">
            </div>
            <div class="field">
              <label>Loan Term (months)</label>
              <input type="number" name="durationMonths" placeholder="${defaultDuration}" min="60" max="480" step="1">
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn-secondary" id="modal-cancel">Cancel</button>
            <button type="submit" class="btn-primary">Add Property</button>
          </div>
        </form>
      </div>
    </div>`;
}

// --- Render ---

function getApp() {
  return document.getElementById('app')!;
}

// Full re-render: replaces all DOM. Used for structural changes (add/remove property).
// After replacing innerHTML, updateAllPropertyResults() fills in the result panels,
// then attachListeners() wires delegated click/input handlers to the new DOM root.
function render() {
  const incomeCalcs = calcWAIncome(income, settings);

  getApp().innerHTML = `
    ${pendingSharedProperty ? renderShareBanner(pendingSharedProperty) : ''}
    <header class="site-header">
      <div class="container">
        <h1>Home Buying Calculator</h1>
        <p>Seattle, WA</p>
      </div>
    </header>

    <main>
      <div class="container">
        <section class="finances-section">
          <h2 class="section-title">Finances</h2>
          <div class="income-layout">
            ${renderIncomeInputs()}
            ${renderTargets()}
            ${renderIncomeResults(incomeCalcs)}
            ${renderLoanDefaults()}
            ${renderMonthlyExpenses()}
          </div>
        </section>
        <section class="properties-section">
          <div class="properties-header">
            <h2 class="section-title" style="margin-bottom:0">Properties</h2>
            <button class="btn-add" id="add-prop">+ Add Property</button>
          </div>
          <div class="properties-grid" id="props">
            ${properties.map(p => renderPropertyCard(p)).join('')}
          </div>
        </section>
      </div>
    </main>
    ${renderAddPropertyModal()}`;

  updateAllPropertyResults();
  attachListeners();
}

function updateAllPropertyResults() {
  const incomeCalcs = calcWAIncome(income, settings);
  for (const prop of properties) {
    updatePropertyResult(prop, incomeCalcs);
  }
}

// Partially updates a single property's result panel without touching its input fields.
// Skips calculation if required fields are missing to avoid divide-by-zero noise.
function updatePropertyResult(prop: Property, incomeCalcs: IncomeCalcs) {
  const el = document.getElementById(`results-${prop.id}`);
  if (!el) return;
  const effectiveRate = prop.interestRate ?? settings.defaultInterestRate;
  const effectiveDuration = prop.durationMonths ?? settings.defaultDurationMonths;
  if (!prop.cost || !effectiveRate || !effectiveDuration) {
    el.innerHTML = `<p class="results-empty">Enter details to see calculations.</p>`;
    return;
  }
  el.innerHTML = renderPropertyResults(prop, calcProperty(prop, incomeCalcs, settings));
}

// Swaps only the "Calculated" income card in-place rather than calling render().
// A full re-render would reset scroll position.
function updateIncomeResults() {
  const incomeCalcs = calcWAIncome(income, settings);
  const el = document.getElementById('income-results');
  if (el) el.outerHTML = renderIncomeResults(incomeCalcs);
}

// --- Event handling (delegated) ---
// All click and input events bubble up to #app, avoiding per-element listener management.
// data-* attributes on inputs identify which state field to update.

function attachListeners() {
  const app = getApp();

  const modal = document.getElementById('add-prop-modal')!;

  function openModal() {
    modal.classList.add('is-open');
    (modal.querySelector('input[name="name"]') as HTMLInputElement)?.focus();
  }

  function closeModal() {
    modal.classList.remove('is-open');
    (document.getElementById('add-prop-form') as HTMLFormElement).reset();
  }

  app.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    if (target.id === 'add-prop') { openModal(); return; }
    if (target.id === 'modal-close' || target.id === 'modal-cancel') { closeModal(); return; }
    if (target === modal) { closeModal(); return; } // backdrop click

    if (target.id === 'share-add') {
      if (pendingSharedProperty) {
        properties.push(pendingSharedProperty);
        pendingSharedProperty = null;
        saveState();
        render();
      }
      return;
    }
    if (target.id === 'share-dismiss') {
      pendingSharedProperty = null;
      document.getElementById('share-banner')?.remove();
      return;
    }

    const shareBtn = target.closest('[data-share-id]') as HTMLElement | null;
    if (shareBtn) {
      const id = (shareBtn as HTMLElement).dataset.shareId!;
      const prop = properties.find(p => p.id === id);
      if (!prop) return;
      navigator.clipboard.writeText(buildShareUrl(prop)).then(() => {
        shareBtn.textContent = 'Copied!';
        setTimeout(() => { shareBtn.textContent = 'Share'; }, 2000);
      });
      return;
    }

    const removeBtn = target.closest('[data-remove-id]') as HTMLElement | null;
    if (removeBtn) {
      const id = removeBtn.dataset.removeId!;
      properties = properties.filter(p => p.id !== id);
      saveState();
      render();
    }
  });

  document.getElementById('add-prop-form')!.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const v = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).value.trim();
    const n = (name: string) => { const s = v(name); return s === '' ? null : parseFloat(s); };

    const prop = newProperty();
    prop.name = v('name');
    prop.listingUrl = v('listingUrl');
    prop.photoUrl = v('photoUrl');
    if (prop.listingUrl && !prop.name) prop.name = parseListingUrl(prop.listingUrl).address;
    prop.cost = n('cost') ?? 0;
    prop.monthlyTaxes = n('monthlyTaxes') ?? 0;
    prop.monthlyInsurance = n('monthlyInsurance') ?? 0;
    prop.hoa = n('hoa') ?? 0;
    prop.maintenancePct = n('maintenancePct') !== null ? (n('maintenancePct')! / 100) : null;
    prop.downPayment = n('downPayment');
    prop.additionalFunds = n('additionalFunds') ?? 0;
    prop.interestRate = n('interestRate') !== null ? (n('interestRate')! / 100) : null;
    prop.durationMonths = n('durationMonths');

    properties.push(prop);
    saveState();
    closeModal();
    render();
  });

  app.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Escape' && modal.classList.contains('is-open')) closeModal();
  });

  app.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;

    // Global settings — targets
    if (target.id === 's-savings-pct') { settings.targetSavingsPct = parseFloat(target.value) / 100 || 0.25; updateIncomeResults(); updateAllPropertyResults(); saveState(); return; }
    if (target.id === 's-housing-pct') { settings.targetHousingPct = parseFloat(target.value) / 100 || 0.30; updateAllPropertyResults(); saveState(); return; }
    if (target.id === 's-leftover') { settings.targetLeftoverSpending = parseFloat(target.value) || 9000; updateAllPropertyResults(); saveState(); return; }
    if (target.id === 's-principal') { settings.includePrincipalInSavings = target.checked; updateAllPropertyResults(); saveState(); return; }

    // Global settings — loan defaults
    if (target.id === 's-interest-rate') { settings.defaultInterestRate = parseFloat(target.value) / 100 || 0.065; updateAllPropertyResults(); saveState(); return; }
    if (target.id === 's-down-payment') { settings.defaultDownPayment = parseFloat(target.value) || 0; updateAllPropertyResults(); saveState(); return; }
    if (target.id === 's-duration') { settings.defaultDurationMonths = parseFloat(target.value) || 360; updateAllPropertyResults(); saveState(); return; }

    // Income fields
    const incomeField = target.dataset.income as keyof WAIncome | undefined;
    if (incomeField) {
      if (incomeField === 'partner1Name' || incomeField === 'partner2Name') {
        income[incomeField] = target.value;
        const n = incomeField === 'partner1Name' ? '1' : '2';
        document.querySelectorAll(`[data-partner-name="${n}"]`).forEach(el => { el.textContent = target.value; });
        saveState();
        return;
      }
      (income as unknown as Record<string, number>)[incomeField] = parseFloat(target.value) || 0;
      updateIncomeResults();
      updateAllPropertyResults();
      saveState();
      return;
    }

    // Property fields
    const propField = target.dataset.propField as keyof Property | undefined;
    if (propField) {
      const card = target.closest('[data-id]') as HTMLElement | null;
      if (!card) return;
      const prop = properties.find(p => p.id === card.dataset.id!);
      if (!prop) return;

      if (propField === 'name' || propField === 'listingUrl' || propField === 'photoUrl') {
        (prop as unknown as Record<string, string>)[propField] = target.value;
        if (propField === 'listingUrl') {
          // Update listing link in header without re-rendering the whole card
          const header = card.querySelector('.property-card-header')!;
          let link = header.querySelector('.listing-link') as HTMLAnchorElement | null;
          if (target.value) {
            const parsed = parseListingUrl(target.value);
            if (!link) {
              link = document.createElement('a');
              link.className = 'listing-link';
              link.target = '_blank';
              link.rel = 'noopener';
              header.insertBefore(link, header.querySelector('.btn-remove'));
            }
            link.href = target.value;
            link.textContent = 'View listing ↗';
            if (parsed.address && !prop.name) {
              prop.name = parsed.address;
              const nameInput = card.querySelector('.property-name-input') as HTMLInputElement;
              if (nameInput) nameInput.value = parsed.address;
            }
          } else if (link) {
            link.remove();
          }
        }
        if (propField === 'photoUrl') {
          let photoEl = card.querySelector('.property-photo') as HTMLElement | null;
          if (target.value) {
            if (!photoEl) {
              photoEl = document.createElement('div');
              photoEl.className = 'property-photo';
              card.insertBefore(photoEl, card.firstChild);
            }
            photoEl.innerHTML = `<img src="${target.value}" alt="Property photo" loading="lazy">`;
          } else if (photoEl) {
            photoEl.remove();
          }
        }
        saveState();
        return;
      }

      // Nullable loan detail overrides: empty field → revert to global default
      if (propField === 'interestRate') {
        prop.interestRate = target.value === '' ? null : parseFloat(target.value) / 100 || null;
        updatePropertyResult(prop, calcWAIncome(income, settings));
        saveState();
        return;
      }
      if (propField === 'downPayment') {
        prop.downPayment = target.value === '' ? null : parseFloat(target.value) ?? null;
        updatePropertyResult(prop, calcWAIncome(income, settings));
        saveState();
        return;
      }
      if (propField === 'durationMonths') {
        prop.durationMonths = target.value === '' ? null : parseFloat(target.value) || null;
        updatePropertyResult(prop, calcWAIncome(income, settings));
        saveState();
        return;
      }
      if (propField === 'maintenancePct') {
        prop.maintenancePct = target.value === '' ? null : parseFloat(target.value) / 100 || null;
        updatePropertyResult(prop, calcWAIncome(income, settings));
        saveState();
        return;
      }

      (prop as unknown as Record<string, number>)[propField] = parseFloat(target.value) || 0;
      updatePropertyResult(prop, calcWAIncome(income, settings));
      saveState();
    }
  });
}

function buildShareUrl(prop: Property): string {
  const payload = JSON.stringify({
    name: prop.name, listingUrl: prop.listingUrl, photoUrl: prop.photoUrl,
    cost: prop.cost, downPayment: prop.downPayment, additionalFunds: prop.additionalFunds,
    interestRate: prop.interestRate, durationMonths: prop.durationMonths,
    monthlyTaxes: prop.monthlyTaxes, monthlyInsurance: prop.monthlyInsurance,
    hoa: prop.hoa, maintenancePct: prop.maintenancePct,
  });
  return `${location.origin}${location.pathname}#share=${btoa(payload)}`;
}

function parseShareHash(): Property | null {
  if (!location.hash.startsWith('#share=')) return null;
  try {
    const data = JSON.parse(atob(location.hash.slice(7)));
    const prop = newProperty();
    Object.assign(prop, data);
    return prop;
  } catch { return null; }
}

function renderShareBanner(prop: Property) {
  return `
    <div class="share-banner" id="share-banner">
      <div class="share-banner-inner">
        <span>Property shared with you: <strong>${prop.name || 'Unnamed property'}</strong></span>
        <div class="share-banner-actions">
          <button class="btn-secondary btn-sm" id="share-dismiss">Dismiss</button>
          <button class="btn-primary btn-sm" id="share-add">Add Property</button>
        </div>
      </div>
    </div>`;
}

// Extracts a human-readable address from Redfin/Zillow URLs by parsing the path slug.
// Redfin URL shape: /STATE/City/Street-Address-Zip/home/id
// Zillow URL shape: /homedetails/street-address-city-state-zip/zpid/
function parseListingUrl(url: string): { address: string } {
  try {
    const u = new URL(url);
    const segments = u.pathname.split('/').filter(Boolean);
    let slug = '';
    if (u.hostname.includes('redfin')) {
      slug = segments[2] ?? ''; // address segment is at index 2 after state/city
    } else if (u.hostname.includes('zillow')) {
      slug = segments[1] ?? ''; // address segment is at index 1 after 'homedetails'
    } else {
      slug = segments[0] ?? '';
    }
    return { address: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) };
  } catch {
    return { address: '' };
  }
}

// --- Persistence ---

const STORAGE_KEY = 'hbc-state';

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ income, settings, properties, nextId }));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.income) Object.assign(income, s.income);
    if (s.settings) Object.assign(settings, s.settings);
    if (Array.isArray(s.properties)) properties = s.properties;
    if (s.nextId) nextId = s.nextId;
  } catch { /* ignore corrupt data */ }
}

loadState();
pendingSharedProperty = parseShareHash();
if (pendingSharedProperty) history.replaceState(null, '', location.pathname);
render();
