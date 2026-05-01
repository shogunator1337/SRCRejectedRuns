let rejectedFilterMode = 'hidden'; // 'hidden', 'shown', 'exclusive'
let pendingFilterMode = 'hidden';
let runsInjected = false;
let rejectedDataCache = [];
let rrStatusMsg = '';
let prStatusMsg = '';

function updateStatus(id, text) {
  if (id === 'sr-rr-status') rrStatusMsg = text;
  if (id === 'sr-pr-status') prStatusMsg = text;
  
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function initObserver() {
  const observer = new MutationObserver(() => {
    // 1. Пытаемся найти открытую панель фильтров, чтобы встроить туда наш селект
    tryInjectReactFilter();

    // 1.5. Заменяем иконки модераторов на эмодзи какашки
    replaceModeratorIcons();

    // 2. Следим за изменениями (URL или таблица)
    const table = document.querySelector('table:not([data-rr-fake="true"])'); 
    
    const currentUrl = location.href;
    let urlChanged = false;

    if (document.body.dataset.rrLastUrl !== currentUrl) {
      document.body.dataset.rrLastUrl = currentUrl;
      urlChanged = true;
      runsInjected = false;
      // remove old fake table on url change
      const fakeT = document.getElementById('sr-rr-fake-table-container');
      if (fakeT) {
          if (fakeT.dataset.rrEmptyStateHidden === 'true') {
              const prev = fakeT.previousElementSibling;
              if (prev) prev.style.display = '';
          }
          fakeT.remove();
      }
    }

    if (table) {
      if (table.dataset.rrObservedUrl !== currentUrl) {
        table.dataset.rrObservedUrl = currentUrl;
        runsInjected = false;
        urlChanged = true;
      }
    }

    if (urlChanged) {
      applyFilterMode();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function tryInjectReactFilter() {
  if (document.getElementById('sr-rr-filter-container')) return;

  const path = location.pathname.toLowerCase();
  const isExcludedPage = path.includes('/forums') || path.includes('/thread') || path.includes('/streams') || path.includes('/guides') || path.includes('/resources') || path.includes('/user') || path.includes('/news') || path.includes('/settings');
  if (isExcludedPage) return;

  const dialogs = document.querySelectorAll('dialog, [role="dialog"], .modal, .tippy-box');
  let openDialog = null;
  
  if (dialogs.length > 0) {
    for (let d of dialogs) {
       if (d.getBoundingClientRect().width > 0) {
           openDialog = d;
       }
    }
  }

  // Without a dialog, we don't inject.
  if (!openDialog) return;

  // Let's verify this is the Filters dialog by checking its title/headings
  // Specifically look for "Filters" or "Фильтры" and NOT "Rules"
  const headings = Array.from(openDialog.querySelectorAll('h2, h3, h1, header')).map(e => e.textContent.toLowerCase());
  const isFilters = headings.some(txt => txt.includes('filters') || txt.includes('фильтры'));
  const isRules = headings.some(txt => txt.includes('rules') || txt.includes('правила'));
  
  if (isRules && !isFilters) {
      return; // "не надо никуда кроме filters встраивать настройки, в том числе в rules"
  }
  
  // Search for the template filter row to clone
  let searchRoot = openDialog;
  const labels = searchRoot.querySelectorAll('label, div, span, p, h2, h3');
  let templateFilter = null;
  
  for (let i = 0; i < labels.length; i++) {
    const el = labels[i];
    if (el.closest('table')) continue;

    const txt = el.textContent.trim().toLowerCase();
    
    const isExactMatch = (txt === 'obsolete runs' || txt === 'obsolete' || 
        txt === 'emulator runs' || txt === 'emulator' ||
        txt === 'устаревшие раны' || txt === 'устаревшие' || 
        txt === 'эмулятор' || txt === 'раны с эмулятора' || txt === 'carreras obsoletas' || 
        txt === 'carreras en emulador' || txt === 'les runs obsolètes' || txt === 'les runs sur émulateur');

    if (isExactMatch) {
      if (el.childElementCount <= 2) {
        let parent = el.parentElement;
        let foundButtons = false;
        while(parent && parent.tagName !== 'BODY' && searchRoot.contains(parent)) {
           if (parent.querySelectorAll('button').length >= 2) {
               foundButtons = true;
               break;
           }
           parent = parent.parentElement;
        }
        
        if (foundButtons) {
            templateFilter = el;
            break;
        }
      }
    }
  }

  if (!templateFilter) {
     const anyButtons = searchRoot.querySelectorAll('button');
     for (let b of anyButtons) {
        let parent = b.parentElement;
        if (parent && parent.querySelectorAll('button').length >= 2) {
           let row = parent.parentElement;
           if (row && row.textContent.trim().length > 0) {
               const header = row.querySelector('label, p, span, div');
               if (header) {
                   templateFilter = header;
                   break;
               }
           }
        }
     }
  }

  if (templateFilter) {
    let container = templateFilter;
    while (container && container.tagName !== 'BODY') {
      const isFilterContainer = container.tagName === 'DIV' && Array.from(container.children).some(child => child.tagName === 'LABEL' || child.querySelector('label'));
      const hasTitleElement = !!container.querySelector('div, span, p, h2, h3, label'); 

      const buttons = container.querySelectorAll('button');
      if (buttons.length >= 2 || (isFilterContainer && hasTitleElement)) {
        break;
      }
      container = container.parentElement;
    }
    
    if (container && container.tagName === 'BODY') {
       container = templateFilter.parentElement;
       while(container && container.tagName !== 'DIV' && container.tagName !== 'BODY') {
           container = container.parentElement;
       }
    }

    if (container && container.tagName !== 'BODY') {
      injectFilterViaClone(container);
    }
  }
}

function injectFilterViaClone(templateNode) {
  if (document.getElementById('sr-rr-filter-container')) return;
  
  const masterContainer = document.createElement('div');
  masterContainer.id = 'sr-rr-filter-container';
  masterContainer.style.display = 'flex';
  masterContainer.style.flexDirection = 'column';
  masterContainer.style.gap = '16px';
  masterContainer.style.marginTop = '1rem';
  masterContainer.style.marginBottom = '1rem';

  const createCloneBlock = (title, iconSvg, modeGetter, modeSetter) => {
    const clone = templateNode.cloneNode(true);
    clone.style.margin = '0';
    
    const replaceText = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent && node.textContent.trim().length > 0) {
          const txt = node.textContent.trim().toLowerCase();
          if (txt === 'obsolete runs' || txt === 'obsolete' || 
              txt === 'emulator runs' || txt === 'emulator' ||
              txt === 'устаревшие раны' || txt === 'устаревшие' || 
              txt === 'эмулятор' || txt === 'раны с эмулятора' || txt === 'раны на эмуляторе' ||
              txt === 'carreras obsoletas' || txt === 'obsoleto' ||
              txt === 'carreras en emulador' || txt === 'emulador' ||
              txt === 'les runs obsolètes' || txt === 'obsolète' ||
              txt === 'les runs sur émulateur' || txt === 'émulateur' || txt === 'emulateur' ||
              txt.includes('obsolete') || txt.includes('emulator') || txt.includes('runs') || txt.includes('platform') || 
              txt.includes('устаревшие') || txt.includes('эмулятор') || txt.includes('раны') || txt.includes('платформа') ||
              txt.includes('obsoleto') || txt.includes('emulador') || txt.includes('carrera') ||
              txt.includes('obsolète') || txt.includes('émulateur') || txt.includes('emulateur')) {
            node.textContent = title;
          }
        }
      } else {
        Array.from(node.childNodes).forEach(child => {
          if (child.tagName !== 'SVG' && child.tagName !== 'BUTTON') {
            replaceText(child);
          }
        });
      }
    };
    
    replaceText(clone);
    
    const svg = clone.querySelector('svg');
    if (svg && iconSvg) {
      svg.innerHTML = iconSvg;
      svg.setAttribute('viewBox', '0 0 20 20');
    }

    let originalButtons = Array.from(templateNode.querySelectorAll('button'));
    if (originalButtons.length === 0) {
        const fallbackBtn = document.createElement('button');
        fallbackBtn.className = "flex items-center justify-center rounded-sm px-2 py-1 text-sm font-medium transition-colors hover:bg-neutral-800 focus:outline-none dark:hover:bg-neutral-700 bg-neutral-900 text-white dark:bg-white dark:text-black";
        originalButtons = [fallbackBtn, fallbackBtn];
    }
    
    let selectedBtnClass = '';
    let unselectedBtnClass = '';
    
    let classCounts = {};
    for (let b of originalButtons) {
        classCounts[b.className] = (classCounts[b.className] || 0) + 1;
    }
    
    let uniqueClasses = Object.keys(classCounts).sort((a, b) => classCounts[a] - classCounts[b]);
    
    if (uniqueClasses.length > 1) {
        // Find the "selected" vs "unselected" classes.
        // We know that one is often Red/Brand, and the other is Black/Gray.
        // The selected one is usually the minority (frequency 1 out of 3), or defaults to the first button.
        let classA = uniqueClasses[0]; 
        let classB = uniqueClasses[1];
        
        // Speedrun.com's selected button usually has a solid background (e.g. red/green), 
        // while unselected buttons often have a secondary/transparent style.
        // If we simply check which one originalButtons[0] uses, and assume it's the selected one? No, 
        // the user said they are swapped when we used originalButtons[0] as Unselected.
        // Let's actually find the one with active terms or fewer buttons using it
        
        let c0 = originalButtons[0].className;
        let c1 = originalButtons.find(b => b.className !== c0)?.className || c0;
        
        // A simple trick: in Speedrun.com unselected buttons usually have things like "bg-white/5", "hover:bg-white/10"
        // while selected is "bg-red-something" or "bg-primary-something"
        // Let's try to detect the active one using typical speedrun.com classes
        const isC0Active = c0.includes('bg-red') || c0.includes('bg-green') || c0.includes('bg-primary') || c0.includes('bg-brand') || c0.match(/bg-[a-z]+-700/) || c0.match(/bg-[a-z]+-600/);
        const isC1Active = c1.includes('bg-red') || c1.includes('bg-green') || c1.includes('bg-primary') || c1.includes('bg-brand') || c1.match(/bg-[a-z]+-700/) || c1.match(/bg-[a-z]+-600/);
        
        if (isC0Active && !isC1Active) {
            selectedBtnClass = c0;
            unselectedBtnClass = c1;
        } else if (isC1Active && !isC0Active) {
            selectedBtnClass = c1;
            unselectedBtnClass = c0;
        } else {
            // Fallback: minority class is selected, majority is unselected
            if (classCounts[classA] < classCounts[classB]) {
                selectedBtnClass = classA;
                unselectedBtnClass = classB;
            } else {
                // If frequency is identical, usually originalButtons[0] is the currently selected one
                selectedBtnClass = c0;
                unselectedBtnClass = c1;
            }
        }
    } else {
        selectedBtnClass = uniqueClasses[0];
        unselectedBtnClass = uniqueClasses[0];
    }

    let btnContainer = clone.querySelector('button')?.parentElement;
    if (!btnContainer) {
        btnContainer = document.createElement('div');
        btnContainer.className = 'flex gap-2 w-full justify-start mt-2';
        clone.appendChild(btnContainer);
    } else {
        btnContainer.innerHTML = ''; 
    }

    const options = ['Hidden', 'Shown', 'Exclusive'];
    options.forEach(opt => {
         const btnMode = opt.toLowerCase();
         const isSelected = (modeGetter() === btnMode);
         
         const newBtn = originalButtons[0].cloneNode(true);
         newBtn.className = isSelected ? selectedBtnClass : unselectedBtnClass;
         newBtn.textContent = opt;
         
         newBtn.addEventListener('click', async (e) => {
             e.preventDefault();
             modeSetter(btnMode);
             
             Array.from(btnContainer.querySelectorAll('button')).forEach(b => {
                 const isBtnSelected = (b.textContent.toLowerCase() === btnMode);
                 b.className = isBtnSelected ? selectedBtnClass : unselectedBtnClass;
             });
             
             applyFilterMode();
         });
         btnContainer.appendChild(newBtn);
    });
      
    const statusSpan = document.createElement('div');
    statusSpan.id = title === 'Rejected runs' ? 'sr-rr-status' : 'sr-pr-status';
    statusSpan.textContent = title === 'Rejected runs' ? rrStatusMsg : prStatusMsg;
    statusSpan.style.cssText = 'font-size: 12px; color: #a1a1aa; margin-top: 6px; padding-left: 2px;';
    
    const flexCol = clone.tagName === 'DIV' ? clone : (clone.querySelector('div') || clone); 
    flexCol.appendChild(statusSpan);

    return clone;
  };

  const rejectedClone = createCloneBlock('Rejected runs', '<path fill-rule="evenodd" clip-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" fill="currentColor"/>', () => rejectedFilterMode, (v) => rejectedFilterMode = v);
  const pendingClone = createCloneBlock('Waiting for approve', '<path fill-rule="evenodd" clip-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" fill="currentColor"/>', () => pendingFilterMode, (v) => pendingFilterMode = v);

  masterContainer.appendChild(rejectedClone);
  masterContainer.appendChild(pendingClone);

  if (templateNode.nextSibling) {
      templateNode.parentElement.insertBefore(masterContainer, templateNode.nextSibling);
  } else {
      templateNode.parentElement.appendChild(masterContainer);
  }
}

async function applyFilterMode() {
  const path = location.pathname.toLowerCase();
  const isExcludedPage = path.includes('/forums') || path.includes('/thread') || path.includes('/streams') || path.includes('/guides') || path.includes('/resources') || path.includes('/user') || path.includes('/news') || path.includes('/settings');
  if (isExcludedPage) return;

  let table = document.querySelector('table:not([data-rr-fake="true"])');
  let isFakeTable = false;
  if (!table) {
    table = document.getElementById('sr-rr-fake-table');
    if (!table) {
      table = document.createElement('table');
      table.id = 'sr-rr-fake-table';
      table.dataset.rrFake = "true";
      table.innerHTML = `
        <thead style="border-bottom: 1px solid color-mix(in srgb, currentColor 20%, transparent); font-size: 0.75rem; text-transform: uppercase; font-weight: bold; opacity: 0.8; letter-spacing: 0.05em;">
            <tr>
                <th style="padding: 12px 16px; text-align: center;">#</th>
                <th style="padding: 12px 16px; text-align: center;">Players</th>
                <th style="padding: 12px 16px; text-align: center;">Time</th>
                <th style="padding: 12px 16px; text-align: center;">Date</th>
                <th style="padding: 12px 16px; text-align: center;">Platform</th>
            </tr>
        </thead>
        <tbody style="font-size: 0.875rem;"></tbody>
      `;
      table.className = "w-full text-left";
    }
    isFakeTable = true;
  }

  const originalRows = isFakeTable ? [] : document.querySelectorAll('tr:not(.sr-rr-inline-row):not(.empty-state)');
  const theads = isFakeTable ? [] : document.querySelectorAll('thead tr');

  if (!runsInjected) {
    await fetchAndInjectRuns(table);
  }

  if (rejectedFilterMode === 'hidden' && pendingFilterMode === 'hidden') {
    document.querySelectorAll('.sr-rr-inline-row').forEach(row => row.style.display = 'none');
    originalRows.forEach(row => { if (row.style) row.style.display = ''; });
    if (isFakeTable) {
        const fakeContainer = document.getElementById('sr-rr-fake-table-container');
        if (fakeContainer) {
            fakeContainer.style.display = 'none';
            if (fakeContainer.dataset.rrEmptyStateHidden === 'true') {
                const prev = fakeContainer.previousElementSibling;
                if (prev) prev.style.display = '';
            }
        }
    }
    return;
  }
  
  if (isFakeTable) {
      const fakeContainer = document.getElementById('sr-rr-fake-table-container');
      if (fakeContainer) {
          fakeContainer.style.display = '';
          if (fakeContainer.dataset.rrEmptyStateHidden === 'true') {
              const prev = fakeContainer.previousElementSibling;
              if (prev) prev.style.display = 'none';
          }
      }
  }

  document.querySelectorAll('.sr-rr-inline-row').forEach(row => {
     const status = row.dataset.runStatus; 
     const mode = status === 'new' ? pendingFilterMode : rejectedFilterMode;
     
     if (mode === 'hidden') {
         row.style.display = 'none';
     } else {
         row.style.display = '';
     }
  });

  if (rejectedFilterMode === 'exclusive' || pendingFilterMode === 'exclusive') {
    originalRows.forEach(row => {
      // Прячем оригинальные раны, но не прячем заголовки!
      if (!row.closest('thead')) {
         row.style.display = 'none';
      }
    });
    theads.forEach(r => { if (r.style) r.style.display = ''; });
  } else {
    originalRows.forEach(row => {
      if (!row.closest('thead')) {
         if (row.style) row.style.display = '';
      }
    });
  }
}

function formatTime(isoDuration) {
  if (!isoDuration) return 'N/A';
  return isoDuration.replace('PT', '').toLowerCase();
}

function timeToSeconds(timeStr) {
  timeStr = timeStr.trim().toLowerCase();
  if (!timeStr) return 99999999;
  
  if (/[hms]/.test(timeStr)) {
    let t = 0;
    const h = timeStr.match(/(\d+)h/);
    const m = timeStr.match(/(\d+)m(?!s)/);
    const s = timeStr.match(/(\d+(?:\.\d+)?)s/);
    const ms = timeStr.match(/(\d+)ms/);
    if (h) t += parseInt(h[1]) * 3600;
    if (m) t += parseInt(m[1]) * 60;
    if (s) t += parseFloat(s[1]);
    if (ms) t += parseFloat(ms[1]) / 1000;
    return t || 99999999;
  }
  
  if (timeStr.includes(':')) {
    const parts = timeStr.split(':').map(parseFloat);
    if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2];
    if (parts.length === 2) return parts[0]*60 + parts[1];
  }
  
  const parsed = parseFloat(timeStr);
  return isNaN(parsed) ? 99999999 : parsed;
}

let currentFetchId = 0;
async function fetchAndInjectRuns(tableElement) {
  const fetchId = ++currentFetchId;

  function updateStatus(spanId, text, color = null) {
    if (spanId === 'sr-rr-status') rrStatusMsg = text;
    if (spanId === 'sr-pr-status') prStatusMsg = text;

    const span = document.getElementById(spanId);
    if (span) {
      span.textContent = text;
      if (color) span.style.color = color;
    }
  }

  updateStatus('sr-rr-status', '(Загрузка API...)', '#aaa');
  updateStatus('sr-pr-status', '(Загрузка API...)', '#aaa');

  try {
    const url = new URL(window.location.href);
    const pathParts = url.pathname.split('/').filter(p => p);
    
    // Check if the first part is a locale like 'ru-RU' or 'en-GB'
    const localeRegex = /^[a-z]{2}(-[a-z]{2})?$/i;
    if (pathParts[0] && localeRegex.test(pathParts[0])) {
      pathParts.shift();
    }
    
    let gameAbbreviation = pathParts[0] || 'morrowind';
    if (gameAbbreviation === 'games' && pathParts[1]) {
      gameAbbreviation = pathParts[1];
    }

    // 1. Fetch Game ID
    const gameRes = await fetch(`https://www.speedrun.com/api/v1/games?abbreviation=${gameAbbreviation}`);
    const gameData = await gameRes.json();
    if (fetchId !== currentFetchId) return;
    
    if (!gameData.data || gameData.data.length === 0) {
      updateStatus('sr-rr-status', '(Игра не найдена)');
      updateStatus('sr-pr-status', '(Игра не найдена)');
      return;
    }
    const gameId = gameData.data[0].id;

    let targetCategory = null;
    let targetLevel = null;
    let targetVars = {};
    
    // Пытаемся найти эталонный ран в видимой таблице (гарантирует получение всех дефолтных переменных)
    const referenceRunLink = tableElement.querySelector('a[href*="/run/"], a[href*="/runs/"]');
    if (referenceRunLink) {
      const match = referenceRunLink.href.match(/\/run(?:s)?\/([a-z0-9]+)/i);
      if (match && match[1]) {
        try {
          const refRes = await fetch(`https://www.speedrun.com/api/v1/runs/${match[1]}`);
          const refData = await refRes.json();
          if (fetchId !== currentFetchId) return;
          if (refData?.data) {
            targetCategory = refData.data.category;
            targetLevel = refData.data.level;
            targetVars = refData.data.values || {};
          }
        } catch(e) { console.warn(e); }
      }
    }
    
    // Фоллбэк на URL параметр x
    const xParam = url.searchParams.get('x');
    if (!targetCategory && xParam) {
      const parts = xParam.split('-');
      let startIndex = 1;
      if (parts.length > 0 && parts[0]) {
        if (parts[0].startsWith('l_')) {
          targetLevel = parts[0].substring(2);
          if (parts.length > 1) {
            targetCategory = parts[1];
          }
          startIndex = 2;
        } else {
          targetCategory = parts[0];
          startIndex = 1;
        }
        for (let i = startIndex; i < parts.length; i++) {
          const vParts = parts[i].split('.');
          if (vParts.length === 2) targetVars[vParts[0]] = vParts[1];
        }
      }
    }

    // Определяем какие переменные являются сабкатегориями, а также сохраняем их для колонок
    let subcategoryVarIds = new Set();
    const variablesMap = {};
    if (gameId) {
      try {
        const varsRes = await fetch(`https://www.speedrun.com/api/v1/games/${gameId}/variables`);
        const varsData = await varsRes.json();
        if (fetchId !== currentFetchId) return;
        if (varsData?.data) {
          varsData.data.forEach(v => {
            variablesMap[v.name.toLowerCase()] = v;
            if (v['is-subcategory'] && (v.category === targetCategory || v.category === null)) {
              subcategoryVarIds.add(v.id);
            }
          });
        }
      } catch(e) {}
    }

    let categoryQuery = targetCategory ? `&category=${targetCategory}` : '';
    let levelQuery = targetLevel ? `&level=${targetLevel}` : '';
    let varsQuery = '';
    const strictVars = {};

    for (const [vId, vVal] of Object.entries(targetVars)) {
      if (subcategoryVarIds.has(vId) || (!referenceRunLink && xParam)) {
        strictVars[vId] = vVal;
        varsQuery += `&var-${vId}=${vVal}`;
      }
    }

    // 2. Fetch Rejected & Pending Runs
    updateStatus('sr-rr-status', '(Ищем раны...)', '#aaa');
    updateStatus('sr-pr-status', '(Ищем раны...)', '#aaa');
    const pagesToFetch = [0, 200, 400, 600, 800];
    const fetchPromises = pagesToFetch.map(async offset => {
        try {
            const resRej = fetch(`https://www.speedrun.com/api/v1/runs?status=rejected&game=${gameId}${levelQuery}${categoryQuery}${varsQuery}&max=200&offset=${offset}&embed=players,platform,category`);
            const resNew = fetch(`https://www.speedrun.com/api/v1/runs?status=new&game=${gameId}${levelQuery}${categoryQuery}${varsQuery}&max=200&offset=${offset}&embed=players,platform,category`);
            const [dataRej, dataNew] = await Promise.all([
                resRej.then(r => r.json()).catch(() => ({data: []})),
                resNew.then(r => r.json()).catch(() => ({data: []}))
            ]);
            return [...(dataRej.data || []), ...(dataNew.data || [])];
        } catch(e) { return []; }
    });
    
    const results = await Promise.all(fetchPromises);
    if (fetchId !== currentFetchId) return;
    const allFetchedRuns = [];
    results.forEach(batch => allFetchedRuns.push(...batch));

    // 3. Строгая локальная фильтрация (API иногда игнорирует параметры или выдает дефолтные)
    let runs = allFetchedRuns.filter(r => {
      const rLev = r.level?.data?.id || r.level;
      if (targetLevel) {
        if (rLev && rLev !== targetLevel) return false;
      } else {
        if (rLev) return false;
      }
      
      if (targetCategory) {
        const rCat = r.category?.data?.id || r.category;
        if (rCat && rCat !== targetCategory) return false;
      }
      if (r.values) {
         for (const [vId, vVal] of Object.entries(strictVars)) {
             if (r.values[vId] !== vVal) return false;
         }
      } else if (Object.keys(strictVars).length > 0) {
         return false;
      }
      return true;
    });

    runs = Array.from(new Map(runs.map(run => [run.id, run])).values());

    if (runs.length === 0) {
      updateStatus('sr-rr-status', '(Отклоненных ранов нет)');
      updateStatus('sr-pr-status', '(Ожидающих ранов нет)');
      runsInjected = true;
      return;
    }

    rejectedDataCache = runs;
    const numRej = runs.filter(r => r.status.status === 'rejected').length;
    const numNew = runs.filter(r => r.status.status === 'new').length;
    updateStatus('sr-rr-status', `(Встроено: ${numRej})`);
    updateStatus('sr-pr-status', `(Встроено: ${numNew})`);

    const tbody = tableElement.querySelector('tbody') || tableElement;
    
    // Удаляем старые встроенные строки, если они почему-то остались
    tbody.querySelectorAll('.sr-rr-inline-row').forEach(row => row.remove());
    
    // 3. Получаем заголовки только из ПЕРВОЙ строки THEAD, чтобы избежать дублирования из-за sticky headers
    const firstHeaderRow = tableElement.querySelector('thead tr');
    const headersRaw = firstHeaderRow ? Array.from(firstHeaderRow.querySelectorAll('th')) : [];
    const headers = headersRaw.map(th => th.textContent.trim().toLowerCase());
    
    // Ищем хотя бы одну нормальную строку, чтобы взять её число колонок и классы стилей
    const templateRow = tbody.querySelector('tr:not(.sr-rr-inline-row):not(.empty-state)');
    const expectedCols = templateRow ? templateRow.children.length : Math.max(headers.length, 4);

    const newRows = [];

    runs.forEach(run => {
      const tr = document.createElement('tr');
      tr.className = 'sr-rr-inline-row';
      const isPending = run.status.status === 'new';
      tr.dataset.runStatus = isPending ? 'new' : 'rejected';
      
      const bgColor = isPending ? 'rgba(50, 150, 255, 0.1)' : 'rgba(255, 50, 50, 0.1)';
      const hoverBgColor = isPending ? 'rgba(50, 150, 255, 0.2)' : 'rgba(255, 50, 50, 0.2)';
      const textColor = isPending ? '#3296ff' : '#ff3333';
      
      tr.style.backgroundColor = bgColor;
      tr.style.cursor = 'pointer';
      
      if (isPending) {
        tr.title = 'Ожидает проверки';
      } else {
        tr.title = 'Причина отказа: ' + (run.status.reason || 'Не указана');
      }
      tr.onclick = () => window.open(run.weblink, '_blank');
      
      tr.onmouseenter = () => tr.style.backgroundColor = hoverBgColor;
      tr.onmouseleave = () => tr.style.backgroundColor = bgColor;

      const timeT = run.times.primary_t || 0;
      tr.dataset.time_t = timeT;

      const badgeStr = isPending ? 'PEND' : 'REJC';
      const rankHTML = `<span style="background:${textColor};color:white;padding:2px 4px;border-radius:4px;font-size:10px;font-weight:bold;">${badgeStr}</span>`;
      
      let playersHTMLList = [];
      if (run.players?.data) {
        run.players.data.forEach(p => {
           let name = 'Unknown';
           let flagHTML = '';
           if (p.rel === 'user') {
               name = p.names?.international || p.names?.japanese || p.name || 'Unknown';
               const cc = p.location?.country?.code;
               if (cc) {
                   const formattedCc = cc.replace(/\//g, '-').toLowerCase();
                   flagHTML = `<img src="https://flagcdn.com/16x12/${formattedCc}.png" srcset="https://flagcdn.com/32x24/${formattedCc}.png 2x" alt="${cc}" style="display:inline-block; vertical-align:middle; margin-right:6px; box-shadow: 0 0 1px rgba(255,255,255,0.2);">`;
               }
           } else {
               name = p.name || 'Guest';
           }
           playersHTMLList.push(`<span style="white-space:nowrap; display: inline-flex; align-items: center;">${flagHTML}<span style="color:${textColor}; font-weight:bold;">${name}</span></span>`);
        });
      }
      if (playersHTMLList.length === 0) playersHTMLList.push(`<span style="color:${textColor};">Unknown</span>`);
      
      const combinedPlayerHTML = `<div style="display: flex; flex-wrap: wrap; align-items: center; row-gap: 4px;">${playersHTMLList.join('<span style="margin: 0 6px;">·</span>')}</div>`;

      const timeStr = formatTime(run.times.primary);
      const platVal = run.platform?.data?.name || '-';
      
      let dateVal = '-';
      if (run.date) {
         try {
           const runDate = new Date(run.date);
           const now = new Date();
           runDate.setHours(0,0,0,0);
           now.setHours(0,0,0,0);
           const diffTime = runDate.getTime() - now.getTime();
           const diffDays = Math.round(diffTime / (1000 * 3600 * 24));
           
           const rtf = new Intl.RelativeTimeFormat(navigator.language || 'en', { numeric: 'always' });
           const absDays = Math.abs(diffDays);
           
           let relativeStr = '';
           if (absDays < 30) {
             relativeStr = rtf.format(diffDays, 'day');
           } else if (absDays < 365) {
             relativeStr = rtf.format(Math.round(diffDays / 30.416), 'month');
           } else {
             relativeStr = rtf.format(Math.round(diffDays / 365.25), 'year');
           }
           
           dateVal = `<span title="${run.date}">${relativeStr}</span>`;
         } catch(e) {
           dateVal = run.date;
         }
      }

      let placedPlayer = false;
      let placedTime = false;

      // Подготавливаем контент для ожидаемого числа ячеек
      const cellContents = new Array(expectedCols).fill('');
      cellContents[0] = rankHTML; // Всегда ранк в 0 индексе

      for (let i = 1; i < expectedCols; i++) {
        const h = headers[i] || '';
        
        let customVarFound = false;
        let matchedVar = null;
        Object.values(variablesMap).forEach(v => {
           if (h === v.name.toLowerCase() || h.includes(v.name.toLowerCase())) matchedVar = v;
        });
        
        if (matchedVar && run.values && run.values[matchedVar.id]) {
           const valId = run.values[matchedVar.id];
           const label = matchedVar.values.values[valId]?.label;
           if (label) {
               cellContents[i] = label;
               customVarFound = true;
           }
        }
        
        if (!customVarFound) {
            if (h.includes('player') || h.includes('игрок') || h.includes('runner') || h.includes('players')) {
                cellContents[i] = combinedPlayerHTML;
                placedPlayer = true;
            } else if (h.includes('time') || h.includes('время') || h.includes('rt') || h.includes('igt')) {
                let specificTimeStr = timeStr;
                if (h === 'lrt' || h.includes('load')) {
                    specificTimeStr = run.times.realtime_noloads ? formatTime(run.times.realtime_noloads) : '-';
                } else if (h === 'igt' || h.includes('in-game')) {
                    specificTimeStr = run.times.ingame ? formatTime(run.times.ingame) : '-';
                } else if (h === 'rta' || h === 'real time' || h === 'rt') {
                    specificTimeStr = run.times.realtime ? formatTime(run.times.realtime) : timeStr;
                }
                cellContents[i] = `<span style="font-weight:bold;">${specificTimeStr}</span>`;
                placedTime = true;
            } else if (h.includes('platform') || h.includes('платформа')) {
                cellContents[i] = platVal;
            } else if (h.includes('date') || h.includes('дата')) {
                cellContents[i] = dateVal;
            }
        }
      }

      // Если заголовки были пустые или не совпали, делаем жесткий фоллбэк на нужные столбцы
      if (!placedPlayer && expectedCols > 1) {
          cellContents[1] = combinedPlayerHTML;
      }
      if (!placedTime && expectedCols > 2) {
          if (!cellContents[2]) cellContents[2] = `<span style="font-weight:bold;">${timeStr}</span>`;
          else if (expectedCols > 3) cellContents[3] = `<span style="font-weight:bold;">${timeStr}</span>`;
      }

      // Создаем <td> элементы
      for (let i = 0; i < expectedCols; i++) {
        const td = document.createElement('td');
        if (templateRow && templateRow.children[i]) {
            td.className = templateRow.children[i].className;
        } else {
            td.style.padding = "8px 16px";
            td.style.verticalAlign = "middle";
        }
        
        td.innerHTML = cellContents[i];
        
        // Центрируем все колонки кроме игрока (которая обычно 2-я)
        let isPlayerCol = false;
        if (typeof cellContents[i] === 'string' && cellContents[i].includes('color:#d44242;')) {
           isPlayerCol = true;
        } else if (i === 1 && !templateRow) {
           isPlayerCol = true; 
        }

        if (!isPlayerCol) {
           td.style.textAlign = 'center';
        }
        
        if (!templateRow && i === 0) { // Rank column styling fallback
           td.style.opacity = '0.7';
           td.style.fontWeight = 'bold';
        }

        tr.appendChild(td);
      }
      
      newRows.push(tr);
    });

    // 5. Insert rows in sorted order by mapping existing times
    const existingRows = Array.from(tbody.querySelectorAll('tr:not(.sr-rr-inline-row):not(.empty-state)'));
    const timeColsInfo = [];
    headers.forEach((h, idx) => {
       if (h.includes('time') || h.includes('время') || h.includes('rt') || h.includes('igt') || h.includes('load') || h.includes('in-game')) {
           timeColsInfo.push(idx);
       }
    });

    if (timeColsInfo.length === 0) {
        timeColsInfo.push(expectedCols > 3 ? 3 : 2); // fallback
    }

    // Determine primary timer logic
    const urlParams = new URL(window.location.href);
    let defaultTimerKey = urlParams.searchParams.get('timer'); 
    if (!defaultTimerKey && runs.length > 0) {
        const firstRun = runs.find(r => r.times && r.times.primary);
        if (firstRun) {
            if (firstRun.times.primary === firstRun.times.realtime_noloads) defaultTimerKey = 'twl';
            else if (firstRun.times.primary === firstRun.times.ingame) defaultTimerKey = 'ingame';
            else if (firstRun.times.primary === firstRun.times.realtime) defaultTimerKey = 'realtime';
        }
    }

    timeColsInfo.sort((idxA, idxB) => {
        const hA = headers[idxA] || '';
        const hB = headers[idxB] || '';
        let scoreA = 0;
        let scoreB = 0;
        if (defaultTimerKey === 'twl' && (hA.includes('lrt') || hA.includes('load'))) scoreA = 10;
        if (defaultTimerKey === 'realtime' && (hA === 'rta' || hA === 'real time' || hA === 'rt')) scoreA = 10;
        if (defaultTimerKey === 'ingame' && (hA === 'igt' || hA.includes('in-game'))) scoreA = 10;
        
        if (defaultTimerKey === 'twl' && (hB.includes('lrt') || hB.includes('load'))) scoreB = 10;
        if (defaultTimerKey === 'realtime' && (hB === 'rta' || hB === 'real time' || hB === 'rt')) scoreB = 10;
        if (defaultTimerKey === 'ingame' && (hB === 'igt' || hB.includes('in-game'))) scoreB = 10;

        return scoreB - scoreA;
    });

    // Populate sort keys for new rows
    newRows.forEach(row => {
       const keyVals = [];
       timeColsInfo.forEach(idx => {
           let txt = '';
           if (row.children[idx]) {
               txt = row.children[idx].textContent.trim();
           }
           keyVals.push(timeToSeconds(txt));
       });
       row.dataset.sortKeys = JSON.stringify(keyVals);
    });

    // Sort new rows amongst themselves
    newRows.sort((a, b) => {
        const keysA = JSON.parse(a.dataset.sortKeys);
        const keysB = JSON.parse(b.dataset.sortKeys);
        for (let i = 0; i < keysA.length; i++) {
            if (keysA[i] !== keysB[i]) return keysA[i] - keysB[i];
        }
        return 0;
    });

    const existingTimes = existingRows.map(row => {
       const cells = Array.from(row.querySelectorAll('td, th'));
       const keyVals = [];
       timeColsInfo.forEach(idx => {
           let txt = '';
           if (cells[idx]) txt = cells[idx].textContent.trim();
           keyVals.push(timeToSeconds(txt));
       });
       return { row, keyVals };
    });

    if (existingTimes.length === 0) {
      newRows.forEach(nr => tbody.appendChild(nr));
    } else {
      let newRowIdx = 0;
      for (let i = 0; i < existingTimes.length; i++) {
        const ext = existingTimes[i];
        
        while (newRowIdx < newRows.length) {
            const nrKeys = JSON.parse(newRows[newRowIdx].dataset.sortKeys);
            
            let comesBefore = false;
            for (let k = 0; k < nrKeys.length; k++) {
                if (nrKeys[k] !== ext.keyVals[k]) {
                    comesBefore = nrKeys[k] < ext.keyVals[k];
                    break;
                }
            }
            
            if (comesBefore) {
                tbody.insertBefore(newRows[newRowIdx], ext.row);
                newRowIdx++;
            } else {
                break;
            }
        }
      }
      
      while (newRowIdx < newRows.length) {
        tbody.appendChild(newRows[newRowIdx]);
        newRowIdx++;
      }
    }

    runsInjected = true;
    
    if (tableElement.dataset.rrFake === "true") {
        if (!document.getElementById('sr-rr-fake-table-container')) {
            const wrapper = document.createElement('div');
            wrapper.id = 'sr-rr-fake-table-container';
            wrapper.className = 'overflow-x-auto w-full';
            wrapper.appendChild(tableElement);
            
            // Look for "No runs found" or similar empty state text
            let emptyStateEl = null;
            const treeWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
            let textNode;
            while ((textNode = treeWalker.nextNode())) {
                const text = textNode.nodeValue.trim().toLowerCase();
                if (text.includes('no runs found') || text.includes('no runs matching') || text.includes('no runs have been') || 
                    text.includes('ранов не найдено') || text.includes('нет ранов') || text.includes('не найдено ни одного рана') ||
                    text.includes('записи не найдены')) {
                    
                    let current = textNode.parentElement;
                    while (current && current.parentElement && current.parentElement.tagName !== 'MAIN') {
                        // If the text content is roughly the same length, it's just a structural wrapper
                        const parentText = current.parentElement.textContent.replace(/\s+/g, ' ').trim();
                        if (parentText.length <= text.length + 30) {
                            current = current.parentElement;
                            const classes = current.className || '';
                            if (classes.includes('border') || classes.includes('shadow') || classes.includes('rounded')) {
                                // If we hit the styled card container, we can stop here and use it
                                emptyStateEl = current;
                            }
                        } else {
                            break;
                        }
                    }
                    if (!emptyStateEl) emptyStateEl = current; // fallback if we didn't find a specific card class
                    break;
                }
            }

            if (emptyStateEl && emptyStateEl.parentElement) {
                emptyStateEl.parentElement.insertBefore(wrapper, emptyStateEl.nextSibling);
                // Optionally hide the empty state text
                emptyStateEl.style.display = 'none';
                wrapper.dataset.rrEmptyStateHidden = 'true';
            } else {
                // If we didn't find the empty state text, we are likely not on a leaderboard page, or it's a layout we don't recognize.
                // It's safer to not inject the fake table at all than to randomly inject it on the homepage.
                console.warn('[Speedrun.com Extension] Could not find empty state text, fake table injection aborted to prevent misplacement.');
            }
        }
    }
    
    applyFilterMode(); // Прячем/показываем строки согласно текущему режиму

  } catch (error) {
    console.error(error);
    updateStatus('(Ошибка загрузки API)');
  }
}

initObserver();

function showLoadedToast() {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 20px;
    background: #4caf50;
    color: white;
    padding: 10px 15px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: bold;
    z-index: 999999;
    box-shadow: 0 4px 10px rgba(0,0,0,0.5);
    transition: opacity 0.5s ease-out;
    pointer-events: none;
    font-family: sans-serif;
  `;
  toast.innerText = '✅ Отклоненные раны: Расширение встроено';
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 500);
  }, 3000);
}

if (document.body) {
  showLoadedToast();
} else {
  window.addEventListener('DOMContentLoaded', showLoadedToast);
}

function replaceModeratorIcons() {
  const poopUrl = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">💩</text></svg>';
  
  document.querySelectorAll('img').forEach(img => {
    const src = img.getAttribute('src') || '';
    if (src.includes('moderator') || src.includes('super-moderator') || src.includes('mod-super') || src.includes('mod-normal')) {
      if (img.src !== poopUrl) {
        img.src = poopUrl;
        img.removeAttribute('srcset');
        if (!img.style.transform.includes('scale(1.5)')) {
          img.style.transform = 'scale(1.5)';
        }
      }
    }
  });
}

let lastHref = location.href;
setInterval(() => {
  if (lastHref !== location.href) {
    lastHref = location.href;
    runsInjected = false;
  }
}, 1000);
