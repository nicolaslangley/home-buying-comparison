import './style.css';
import { calcWAIncome, calcBCIncome, calcProperty } from './calculator';
import type { GlobalSettings, WAIncome, BCIncome, Property, IncomeCalcs, PropertyCalcs } from './types';

// --- State ---
// All mutable state lives here as plain objects. No framework — changes trigger
// targeted DOM updates (income results, property result panels) or a full re-render
// (tab switch, add/remove property). Full re-renders are cheap because inputs are few.

const settings: GlobalSettings = {
  targetSavingsPct: 0.25,
  targetHousingPct: 0.30,
  targetLeftoverSpending: 9000,
  includePrincipalInSavings: false,
  usdToCad: 1.37,
};

const waIncome: WAIncome = {
  salary1: 0,
  salary2: 0,
  contribution401k1: 0,
  contribution401k2: 0,
};

const bcIncome: BCIncome = {
  salary1Cad: 0,
  salary2Cad: 0,
  rrsp1: 0,
  rrsp2: 0,
};

let waProperties: Property[] = [];
let bcProperties: Property[] = [];
let nextId = 1;

function newProperty(): Property {
  return {
    id: String(nextId++),
    name: '',
    listingUrl: '',
    cost: 0,
    downPayment1: 0,
    downPayment2: 0,
    interestRate: 0.065, // 6.5% default — reasonable mid-2024 30yr rate
    durationMonths: 360,
    monthlyTaxes: 0,
    monthlyInsurance: 0,
    hoa: 0,
    fixedMonthlyExpenses: 0,
    childcareCosts: 0,
  };
}

// --- Formatting ---

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const cad = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

// Returns CSS class for color-coded badges: good (≤warn), warn (warn..bad], bad (>bad).
function badgeClass(n: number, warn: number, bad: number) {
  if (n <= warn) return 'badge-good';
  if (n <= bad) return 'badge-warn';
  return 'badge-bad';
}

// --- Global settings UI ---

function renderSettings() {
  return `
    <div class="settings-bar">
      <div class="container">
        <details>
          <summary>Settings</summary>
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
              <label>Leftover spending target / mo</label>
              <input type="number" id="s-leftover" value="${settings.targetLeftoverSpending}" min="0" step="500">
            </div>
            <div class="settings-field">
              <label>USD → CAD rate</label>
              <input type="number" id="s-usd-cad" value="${settings.usdToCad}" min="0.5" max="3" step="0.01">
            </div>
            <div class="toggle-field">
              <span class="toggle-label">Principal counts as savings</span>
              <div class="toggle-row">
                <input type="checkbox" id="s-principal" ${settings.includePrincipalInSavings ? 'checked' : ''}>
                <label for="s-principal" style="font-size:0.875rem">Include principal</label>
              </div>
            </div>
          </div>
        </details>
      </div>
    </div>`;
}

// --- Income section ---

function renderWAIncomeInputs() {
  return `
    <div class="income-card">
      <h3>Income &amp; Deductions</h3>
      <div class="income-inputs-grid">
        <div class="field">
          <label>Partner 1 Gross Salary</label>
          <input type="number" data-wa="salary1" value="${waIncome.salary1 || ''}" placeholder="0" min="0" step="1000">
        </div>
        <div class="field">
          <label>Partner 2 Gross Salary</label>
          <input type="number" data-wa="salary2" value="${waIncome.salary2 || ''}" placeholder="0" min="0" step="1000">
        </div>
        <div class="field">
          <label>Partner 1 401k</label>
          <input type="number" data-wa="contribution401k1" value="${waIncome.contribution401k1 || ''}" placeholder="0" min="0" step="500">
        </div>
        <div class="field">
          <label>Partner 2 401k</label>
          <input type="number" data-wa="contribution401k2" value="${waIncome.contribution401k2 || ''}" placeholder="0" min="0" step="500">
        </div>
      </div>
    </div>`;
}

function renderIncomeResults(calcs: IncomeCalcs, currency: 'usd' | 'cad') {
  const fmt = currency === 'cad' ? cad : usd;
  const fmtUsd = usd;
  const isCad = currency === 'cad';

  return `
    <div class="income-card">
      <h3>Calculated</h3>
      ${isCad ? `<p class="cad-note">Amounts in CAD. USD shown at 1 CAD = ${(1 / settings.usdToCad).toFixed(3)} USD</p>` : ''}
      <div class="result-row">
        <span class="result-label">Household Gross</span>
        <span class="result-value">
          ${fmt.format(calcs.grossHousehold)}
          ${isCad ? `<span class="result-sub">${fmtUsd.format(calcs.grossHousehold / settings.usdToCad)} USD</span>` : ''}
        </span>
      </div>
      <div class="result-row">
        <span class="result-label">Total Pre-tax Deductions</span>
        <span class="result-value">${fmt.format(calcs.totalDeductions)}</span>
      </div>
      <div class="result-row">
        <span class="result-label">Est. Taxes</span>
        <span class="result-value">${fmt.format(calcs.taxes)}</span>
      </div>
      <div class="result-row highlight">
        <span class="result-label">Net Annual</span>
        <span class="result-value">
          ${fmt.format(calcs.netAnnual)}
          ${isCad ? `<span class="result-sub">${fmtUsd.format(calcs.netAnnual / settings.usdToCad)} USD</span>` : ''}
        </span>
      </div>
      <div class="result-row highlight">
        <span class="result-label">Net Monthly</span>
        <span class="result-value">
          ${fmt.format(calcs.netMonthly)}
          ${isCad ? `<span class="result-sub">${fmtUsd.format(calcs.netMonthly / settings.usdToCad)} USD</span>` : ''}
        </span>
      </div>
      <div class="result-row">
        <span class="result-label">Monthly Savings Target</span>
        <span class="result-value">${fmt.format(calcs.monthlySavingsTarget)}</span>
      </div>
    </div>`;
}

function renderBCIncomeInputs() {
  return `
    <div class="income-card">
      <h3>Income &amp; Deductions (CAD)</h3>
      <div class="income-inputs-grid">
        <div class="field">
          <label>Partner 1 Gross (CAD)</label>
          <input type="number" data-bc="salary1Cad" value="${bcIncome.salary1Cad || ''}" placeholder="0" min="0" step="1000">
        </div>
        <div class="field">
          <label>Partner 2 Gross (CAD)</label>
          <input type="number" data-bc="salary2Cad" value="${bcIncome.salary2Cad || ''}" placeholder="0" min="0" step="1000">
        </div>
        <div class="field">
          <label>Partner 1 RRSP</label>
          <input type="number" data-bc="rrsp1" value="${bcIncome.rrsp1 || ''}" placeholder="0" min="0" step="500">
        </div>
        <div class="field">
          <label>Partner 2 RRSP</label>
          <input type="number" data-bc="rrsp2" value="${bcIncome.rrsp2 || ''}" placeholder="0" min="0" step="500">
        </div>
      </div>
    </div>`;
}

// --- Property card ---

function renderPropertyInputs(prop: Property, isBc = false) {
  const downLabel1 = 'Partner 1 Down';
  const downLabel2 = 'Partner 2 Down';
  const currencyNote = isBc ? ' (CAD)' : '';

  return `
    <div class="property-card" data-id="${prop.id}">
      <div class="property-card-header">
        <input class="property-name-input" type="text" placeholder="Property name / address"
          data-prop-field="name" value="${prop.name}">
        ${prop.listingUrl ? `<a class="listing-link" href="${prop.listingUrl}" target="_blank" rel="noopener">View listing ↗</a>` : ''}
        <button class="btn-remove" data-remove-id="${prop.id}" title="Remove">×</button>
      </div>
      <div class="property-inputs">
        <div class="url-field">
          <input type="url" placeholder="Redfin / Zillow URL (optional)"
            data-prop-field="listingUrl" value="${prop.listingUrl}">
        </div>
        <div class="property-inputs-grid">
          <div class="field">
            <label>Purchase Price${currencyNote}</label>
            <input type="number" data-prop-field="cost" value="${prop.cost || ''}" placeholder="0" min="0" step="10000">
          </div>
          <div class="field">
            <label>Interest Rate (%)</label>
            <input type="number" data-prop-field="interestRate" value="${(prop.interestRate * 100).toFixed(3)}" placeholder="6.5" min="0" max="20" step="0.125">
          </div>
          <div class="field">
            <label>${downLabel1}${currencyNote}</label>
            <input type="number" data-prop-field="downPayment1" value="${prop.downPayment1 || ''}" placeholder="0" min="0" step="5000">
          </div>
          <div class="field">
            <label>${downLabel2}${currencyNote}</label>
            <input type="number" data-prop-field="downPayment2" value="${prop.downPayment2 || ''}" placeholder="0" min="0" step="5000">
          </div>
          <div class="field">
            <label>Monthly Taxes${currencyNote}</label>
            <input type="number" data-prop-field="monthlyTaxes" value="${prop.monthlyTaxes || ''}" placeholder="0" min="0" step="50">
          </div>
          <div class="field">
            <label>Monthly Insurance${currencyNote}</label>
            <input type="number" data-prop-field="monthlyInsurance" value="${prop.monthlyInsurance || ''}" placeholder="0" min="0" step="10">
          </div>
          <div class="field">
            <label>HOA / mo${currencyNote}</label>
            <input type="number" data-prop-field="hoa" value="${prop.hoa || ''}" placeholder="0" min="0" step="25">
          </div>
          <div class="field">
            <label>Loan Term (months)</label>
            <input type="number" data-prop-field="durationMonths" value="${prop.durationMonths}" placeholder="360" min="60" max="480" step="12">
          </div>
          <div class="field">
            <label>Fixed Monthly Expenses${currencyNote}</label>
            <input type="number" data-prop-field="fixedMonthlyExpenses" value="${prop.fixedMonthlyExpenses || ''}" placeholder="0" min="0" step="100">
          </div>
          <div class="field">
            <label>Childcare / mo${currencyNote}</label>
            <input type="number" data-prop-field="childcareCosts" value="${prop.childcareCosts || ''}" placeholder="0" min="0" step="100">
          </div>
        </div>
      </div>
      <div class="property-results" id="results-${prop.id}">
        <p style="color:var(--text-secondary);font-size:0.875rem">Enter property details above to see calculations.</p>
      </div>
    </div>`;
}

function renderPropertyResults(prop: Property, calcs: PropertyCalcs, isBc = false) {
  const fmt = isBc ? cad : usd;
  const fmtUsd = usd;
  const showUsd = isBc;

  const housingPctClass = badgeClass(calcs.pctOfGross, settings.targetHousingPct, settings.targetHousingPct + 0.05);
  const remainClass = calcs.remainingIncome >= settings.targetLeftoverSpending ? 'badge-good' : calcs.remainingIncome >= settings.targetLeftoverSpending * 0.8 ? 'badge-warn' : 'badge-bad';
  const discClass = calcs.remainingDiscretionary >= 3000 ? 'badge-good' : calcs.remainingDiscretionary >= 1500 ? 'badge-warn' : 'badge-bad';

  const down = prop.downPayment1 + prop.downPayment2;
  const downPct = prop.cost > 0 ? (down / prop.cost) : 0;

  return `
    <div class="result-group">
      <div class="result-group-title">Loan</div>
      <div class="result-row">
        <span class="result-label">Down Payment</span>
        <span class="result-value">
          ${fmt.format(down)}
          <span class="result-sub">${pct(downPct)} of price${showUsd ? ` · ${fmtUsd.format(down / settings.usdToCad)} USD` : ''}</span>
        </span>
      </div>
      <div class="result-row">
        <span class="result-label">Loan Amount</span>
        <span class="result-value">
          ${fmt.format(calcs.loanAmount)}
          ${showUsd ? `<span class="result-sub">${fmtUsd.format(calcs.loanAmount / settings.usdToCad)} USD</span>` : ''}
        </span>
      </div>
    </div>
    <div class="result-group">
      <div class="result-group-title">Monthly Costs</div>
      <div class="result-row">
        <span class="result-label">Principal &amp; Interest</span>
        <span class="result-value">${fmt.format(calcs.monthlyPI)}</span>
      </div>
      <div class="result-row">
        <span class="result-label">Taxes + Insurance + HOA</span>
        <span class="result-value">${fmt.format(prop.monthlyTaxes + prop.monthlyInsurance + prop.hoa)}</span>
      </div>
      <div class="result-row highlight">
        <span class="result-label">Total Monthly</span>
        <span class="result-value">
          ${fmt.format(calcs.totalMonthly)}
          ${showUsd ? `<span class="result-sub">${fmtUsd.format(calcs.totalMonthly / settings.usdToCad)} USD</span>` : ''}
        </span>
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
          <span class="badge ${remainClass}">${fmt.format(calcs.remainingIncome)}/mo</span>
        </span>
      </div>
    </div>
    <div class="result-group">
      <div class="result-group-title">Full Budget</div>
      <div class="result-row">
        <span class="result-label">Annual Maintenance (0.5%)</span>
        <span class="result-value">${fmt.format(calcs.annualMaintenance)}/yr</span>
      </div>
      <div class="result-row">
        <span class="result-label">% on Fixed Costs</span>
        <span class="result-value">${pct(calcs.pctOnFixed)}</span>
      </div>
      <div class="result-row highlight">
        <span class="result-label">Remaining Discretionary</span>
        <span class="result-value">
          <span class="badge ${discClass}">${fmt.format(calcs.remainingDiscretionary)}/mo</span>
          ${showUsd ? `<span class="result-sub">${fmtUsd.format(calcs.remainingDiscretionary / settings.usdToCad)} USD/mo</span>` : ''}
        </span>
      </div>
    </div>`;
}

// --- Full render ---

function getApp() {
  return document.getElementById('app')!;
}

let activeTab: 'wa' | 'bc' = 'wa';

// Full re-render: replaces all DOM. Used for structural changes (tab switch, add/remove property).
// After replacing innerHTML, updateAllPropertyResults() fills in the result panels,
// then attachListeners() wires delegated click/input handlers to the new DOM root.
function render() {
  const waCalcs = calcWAIncome(waIncome, settings);
  const bcCalcs = calcBCIncome(bcIncome, settings);

  getApp().innerHTML = `
    <header class="site-header">
      <div class="container">
        <h1>Home Buying Calculator</h1>
        <p>Compare housing costs across Seattle, WA and British Columbia</p>
      </div>
    </header>

    ${renderSettings()}

    <div class="tabs-wrapper">
      <div class="tabs">
        <button class="tab-btn ${activeTab === 'wa' ? 'active' : ''}" data-tab="wa">Seattle, WA</button>
        <button class="tab-btn ${activeTab === 'bc' ? 'active' : ''}" data-tab="bc">British Columbia</button>
      </div>
    </div>

    <main>
      <div class="tab-panel ${activeTab === 'wa' ? 'active' : ''}" id="panel-wa">
        <div class="container">
          <section class="income-section">
            <h2 class="section-title">Income</h2>
            <div class="income-layout">
              ${renderWAIncomeInputs()}
              ${renderIncomeResults(waCalcs, 'usd')}
            </div>
          </section>
          <section class="properties-section">
            <div class="properties-header">
              <h2 class="section-title" style="margin-bottom:0">Properties</h2>
              <button class="btn-add" id="add-wa-prop">+ Add Property</button>
            </div>
            <div class="properties-grid" id="wa-props">
              ${waProperties.map(p => renderPropertyInputs(p, false)).join('')}
            </div>
          </section>
        </div>
      </div>

      <div class="tab-panel ${activeTab === 'bc' ? 'active' : ''}" id="panel-bc">
        <div class="container">
          <section class="income-section">
            <h2 class="section-title">Income</h2>
            <div class="income-layout">
              ${renderBCIncomeInputs()}
              ${renderIncomeResults(bcCalcs, 'cad')}
            </div>
          </section>
          <section class="properties-section">
            <div class="properties-header">
              <h2 class="section-title" style="margin-bottom:0">Properties</h2>
              <button class="btn-add" id="add-bc-prop">+ Add Property</button>
            </div>
            <div class="properties-grid" id="bc-props">
              ${bcProperties.map(p => renderPropertyInputs(p, true)).join('')}
            </div>
          </section>
        </div>
      </div>
    </main>`;

  // Populate property results after DOM is ready
  updateAllPropertyResults();
  attachListeners();
}

function updateAllPropertyResults() {
  const waCalcs = calcWAIncome(waIncome, settings);
  const bcCalcs = calcBCIncome(bcIncome, settings);

  for (const prop of waProperties) {
    updatePropertyResult(prop, waCalcs, false);
  }
  for (const prop of bcProperties) {
    updatePropertyResult(prop, bcCalcs, true);
  }
}

// Partially updates a single property's result panel without touching its input fields.
// Skips calculation if required fields are missing to avoid divide-by-zero noise.
function updatePropertyResult(prop: Property, incomeCalcs: IncomeCalcs, isBc: boolean) {
  const el = document.getElementById(`results-${prop.id}`);
  if (!el) return;
  if (!prop.cost || !prop.interestRate || !prop.durationMonths) {
    el.innerHTML = `<p style="color:var(--text-secondary);font-size:0.875rem">Enter property details above to see calculations.</p>`;
    return;
  }
  const calcs = calcProperty(prop, incomeCalcs, settings, isBc, settings.usdToCad);
  el.innerHTML = renderPropertyResults(prop, calcs, isBc);
}

// --- Event handling (delegated) ---
// All click and input events bubble up to #app, avoiding per-element listener management.
// data-* attributes on inputs identify which state field to update.

function attachListeners() {
  const app = getApp();

  // Tab switching
  app.addEventListener('click', (e) => {
    const tab = (e.target as HTMLElement).closest('[data-tab]') as HTMLElement | null;
    if (tab) {
      activeTab = tab.dataset.tab as 'wa' | 'bc';
      render();
      return;
    }

    // Add property
    if ((e.target as HTMLElement).id === 'add-wa-prop') {
      waProperties.push(newProperty());
      render();
      return;
    }
    if ((e.target as HTMLElement).id === 'add-bc-prop') {
      bcProperties.push(newProperty());
      render();
      return;
    }

    // Remove property
    const removeBtn = (e.target as HTMLElement).closest('[data-remove-id]') as HTMLElement | null;
    if (removeBtn) {
      const id = removeBtn.dataset.removeId!;
      waProperties = waProperties.filter(p => p.id !== id);
      bcProperties = bcProperties.filter(p => p.id !== id);
      render();
    }
  });

  // Settings inputs
  app.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;

    // Global settings
    if (target.id === 's-savings-pct') { settings.targetSavingsPct = parseFloat(target.value) / 100 || 0.25; updateAllPropertyResults(); updateIncomeResults(); return; }
    if (target.id === 's-housing-pct') { settings.targetHousingPct = parseFloat(target.value) / 100 || 0.30; updateAllPropertyResults(); return; }
    if (target.id === 's-leftover') { settings.targetLeftoverSpending = parseFloat(target.value) || 9000; updateAllPropertyResults(); return; }
    if (target.id === 's-usd-cad') { settings.usdToCad = parseFloat(target.value) || 1.37; updateAllPropertyResults(); updateIncomeResults(); return; }
    if (target.id === 's-principal') { settings.includePrincipalInSavings = target.checked; updateAllPropertyResults(); return; }

    // WA income
    const waField = target.dataset.wa as keyof WAIncome | undefined;
    if (waField) {
      (waIncome as unknown as Record<string, number>)[waField] = parseFloat(target.value) || 0;
      updateIncomeResults();
      updateAllPropertyResults();
      return;
    }

    // BC income
    const bcField = target.dataset.bc as keyof BCIncome | undefined;
    if (bcField) {
      (bcIncome as unknown as Record<string, number>)[bcField] = parseFloat(target.value) || 0;
      updateIncomeResults();
      updateAllPropertyResults();
      return;
    }

    // Property fields
    const propField = target.dataset.propField as keyof Property | undefined;
    if (propField) {
      const card = target.closest('[data-id]') as HTMLElement | null;
      if (!card) return;
      const id = card.dataset.id!;

      const waP = waProperties.find(p => p.id === id);
      const bcP = bcProperties.find(p => p.id === id);
      const prop = waP ?? bcP;
      const isBc = !!bcP;
      if (!prop) return;

      if (propField === 'name' || propField === 'listingUrl') {
        (prop as unknown as Record<string, string>)[propField] = target.value;
        // Update listing link live
        if (propField === 'listingUrl') {
          const header = card.querySelector('.property-card-header');
          if (header) {
            let link = header.querySelector('.listing-link') as HTMLAnchorElement | null;
            if (target.value) {
              const parsed = parseListingUrl(target.value);
              if (!link) {
                link = document.createElement('a');
                link.className = 'listing-link';
                link.target = '_blank';
                link.rel = 'noopener';
                const removeBtn = header.querySelector('.btn-remove');
                header.insertBefore(link, removeBtn);
              }
              link.href = target.value;
              link.textContent = `View listing ↗`;
              if (parsed.address && !prop.name) {
                prop.name = parsed.address;
                const nameInput = card.querySelector('.property-name-input') as HTMLInputElement;
                if (nameInput) nameInput.value = parsed.address;
              }
            } else if (link) {
              link.remove();
            }
          }
        }
        return;
      }

      let val = parseFloat(target.value) || 0;
      if (propField === 'interestRate') val = val / 100; // UI shows %, state stores decimal
      (prop as unknown as Record<string, number>)[propField] = val;

      const incomeCalcs = isBc
        ? calcBCIncome(bcIncome, settings)
        : calcWAIncome(waIncome, settings);
      updatePropertyResult(prop, incomeCalcs, isBc);
    }
  });
}

// Swaps only the "Calculated" income card in-place rather than calling render().
// A full re-render would reset the settings <details> open/closed state and scroll position.
function updateIncomeResults() {
  const waCalcs = calcWAIncome(waIncome, settings);
  const bcCalcs = calcBCIncome(bcIncome, settings);

  const waPanel = document.getElementById('panel-wa');
  const bcPanel = document.getElementById('panel-bc');

  if (waPanel) {
    const cards = waPanel.querySelectorAll('.income-card');
    if (cards.length >= 2) {
      cards[1].outerHTML = renderIncomeResults(waCalcs, 'usd');
    }
  }
  if (bcPanel) {
    const cards = bcPanel.querySelectorAll('.income-card');
    if (cards.length >= 2) {
      cards[1].outerHTML = renderIncomeResults(bcCalcs, 'cad');
    }
  }
}

// Extracts a human-readable address from Redfin/Zillow URLs by parsing the path slug.
// Redfin URL shape: /STATE/City/Street-Address-Zip/home/id
// Zillow URL shape: /homedetails/street-address-city-state-zip/zpid/
// The slug is title-cased and used to auto-fill the property name if it's still empty.
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
    const address = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return { address };
  } catch {
    return { address: '' };
  }
}

// Bootstrap
render();
