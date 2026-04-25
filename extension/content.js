let rejectedFilterMode = 'hidden'; // 'hidden', 'shown', 'exclusive'
let runsInjected = false;
let rejectedDataCache = [];

function initObserver() {
  const observer = new MutationObserver(() => {
    // 1. Пытаемся найти открытую панель фильтров, чтобы встроить туда наш селект
    tryInjectReactFilter();

    // 1.5. Заменяем иконки модераторов на эмодзи какашки
    replaceModeratorIcons();

    // 2. Следим за наличием таблицы
    const table = document.querySelector('table'); 
    
    if (table && table.querySelectorAll('th').length > 0) {
      if (!table.dataset.rrObserved) {
        table.dataset.rrObserved = "true";
        if (rejectedFilterMode !== 'hidden') {
          // Если фильтр включен, а таблица только появилась/обновилась - применяем
          applyFilterMode();
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function tryInjectReactFilter() {
  if (document.getElementById('sr-rr-filter-container')) return;

  // Find the filters modal/dialog 
  // Speedrun.com uses a modal/dialog for filters. 
  // We can locate it by looking for common dialog roles or a container with multiple buttons that is floating.
  const dialogs = document.querySelectorAll('dialog, [role="dialog"], .modal, .tippy-box');
  let openDialog = null;
  
  if (dialogs.length > 0) {
    // get the last one or the visible one
    for (let d of dialogs) {
       if (d.getBoundingClientRect().width > 0) {
           openDialog = d;
       }
    }
  }

  // If we can't find a standard dialog, look for a div that acts like the filters container.
  // The user provided structure: /html/body/div[4]/div/div[2]/div[X]/div[2]/div 
  // This means the filters are a list of rows. We can look for existing filter rows.
  
  let searchRoot = openDialog || document;
  
  const labels = searchRoot.querySelectorAll('label, div, span, p, h2, h3');
  let templateFilter = null;
  
  for (let i = 0; i < labels.length; i++) {
    const el = labels[i];
    
    // Ignore text inside the table itself (if we fallback to document search)
    if (el.closest('table')) continue;

    const txt = el.textContent.trim().toLowerCase();
    
    // Strict exact matches ONLY to avoid grabbing random text on the page!
    const isExactMatch = (txt === 'obsolete runs' || txt === 'obsolete' || 
        txt === 'emulator runs' || txt === 'emulator' ||
        txt === 'устаревшие раны' || txt === 'устаревшие' || 
        txt === 'эмулятор' || txt === 'раны с эмулятора' || txt === 'carreras obsoletas' || 
        txt === 'carreras en emulador' || txt === 'les runs obsolètes' || txt === 'les runs sur émulateur');

    if (isExactMatch) {
      if (el.childElementCount <= 2) {
        // Also verify it has buttons near it!
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

  // If we still can't find a template using exact text, but the dialog is open,
  // we can use ANY typical filter row inside the dialog!
  if (!templateFilter && openDialog) {
     const anyButtons = openDialog.querySelectorAll('button');
     for (let b of anyButtons) {
        let parent = b.parentElement;
        if (parent && parent.querySelectorAll('button').length >= 2) {
           // this parent holds multiple buttons (like Hidden / Shown). Use its parent as template container!
           let row = parent.parentElement;
           if (row && row.textContent.trim().length > 0) {
               // Let's use `row` directly if it looks like a filter item!
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
  
  const clone = templateNode.cloneNode(true);
  clone.id = 'sr-rr-filter-container';
  
  // Меняем текст
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
          
          node.textContent = 'Rejected runs';
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
  
  // Меняем иконку (SVG X)
  const svg = clone.querySelector('svg');
  if (svg) {
    svg.innerHTML = '<path fill-rule="evenodd" clip-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" fill="currentColor"/>';
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
  
  for (let b of originalButtons) {
     const bg = window.getComputedStyle(b).getPropertyValue('background-color');
     const isTransparent = bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent' || bg.replace(/\s+/g,'') === 'rgba(0,0,0,0)';
     if (!isTransparent) {
         selectedBtnClass = b.className;
     } else {
         unselectedBtnClass = b.className;
     }
  }
  
  if (!selectedBtnClass && originalButtons.length > 0) selectedBtnClass = originalButtons[1]?.className || originalButtons[0].className;
  if (!unselectedBtnClass && originalButtons.length > 0) unselectedBtnClass = originalButtons[0].className;

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
       const isSelected = (rejectedFilterMode === btnMode);
       
       const newBtn = originalButtons[0].cloneNode(true);
       newBtn.className = isSelected ? selectedBtnClass : unselectedBtnClass;
       newBtn.textContent = opt;
       
       newBtn.addEventListener('click', async (e) => {
           e.preventDefault();
           rejectedFilterMode = btnMode;
           
           Array.from(btnContainer.querySelectorAll('button')).forEach(b => {
               const isBtnSelected = (b.textContent.toLowerCase() === btnMode);
               b.className = isBtnSelected ? selectedBtnClass : unselectedBtnClass;
           });
           
           applyFilterMode();
       });
       btnContainer.appendChild(newBtn);
  });
    
  const statusSpan = document.createElement('div');
  statusSpan.id = 'sr-rr-status';
  statusSpan.style.cssText = 'font-size: 12px; color: #a1a1aa; margin-top: 6px; padding-left: 2px;';
  
  const flexCol = clone.tagName === 'DIV' ? clone : (clone.querySelector('div') || clone); 
  flexCol.appendChild(statusSpan);

  if (templateNode.nextSibling) {
      templateNode.parentElement.insertBefore(clone, templateNode.nextSibling);
  } else {
      templateNode.parentElement.appendChild(clone);
  }
}

async function applyFilterMode() {
  const table = document.querySelector('table');
  if (!table) return;

  const originalRows = document.querySelectorAll('tr:not(.sr-rr-inline-row):not(.empty-state)');
  const theads = document.querySelectorAll('thead tr');

  if (rejectedFilterMode === 'hidden') {
    document.querySelectorAll('.sr-rr-inline-row').forEach(row => row.style.display = 'none');
    originalRows.forEach(row => row.style.display = '');
    return;
  }
  
  if (!runsInjected) {
    await fetchAndInjectRuns(table);
  }

  if (rejectedFilterMode === 'shown') {
    document.querySelectorAll('.sr-rr-inline-row').forEach(row => row.style.display = '');
    originalRows.forEach(row => row.style.display = '');
  } else if (rejectedFilterMode === 'exclusive') {
    document.querySelectorAll('.sr-rr-inline-row').forEach(row => row.style.display = '');
    originalRows.forEach(row => {
      // Прячем оригинальные раны, но не прячем заголовки!
      if (!row.closest('thead')) {
         row.style.display = 'none';
      }
    });
    theads.forEach(r => r.style.display = '');
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

let isFetchingRuns = false;
async function fetchAndInjectRuns(tableElement) {
  if (isFetchingRuns) return;
  isFetchingRuns = true;

  function updateStatus(text, color = null) {
    const span = document.getElementById('sr-rr-status');
    if (span) {
      span.textContent = text;
      if (color) span.style.color = color;
    }
  }

  updateStatus('(Загрузка API...)', '#aaa');

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
    
    if (!gameData.data || gameData.data.length === 0) {
      updateStatus('(Игра не найдена)');
      return;
    }
    const gameId = gameData.data[0].id;

    let targetCategory = null;
    let targetVars = {};
    
    // Пытаемся найти эталонный ран в видимой таблице (гарантирует получение всех дефолтных переменных)
    const referenceRunLink = tableElement.querySelector('a[href*="/run/"], a[href*="/runs/"]');
    if (referenceRunLink) {
      const match = referenceRunLink.href.match(/\/run(?:s)?\/([a-z0-9]+)/i);
      if (match && match[1]) {
        try {
          const refRes = await fetch(`https://www.speedrun.com/api/v1/runs/${match[1]}`);
          const refData = await refRes.json();
          if (refData?.data) {
            targetCategory = refData.data.category;
            targetVars = refData.data.values || {};
          }
        } catch(e) { console.warn(e); }
      }
    }
    
    // Фоллбэк на URL параметр x
    const xParam = url.searchParams.get('x');
    if (!targetCategory && xParam) {
      const parts = xParam.split('-');
      if (parts.length > 0 && parts[0]) targetCategory = parts[0];
      for (let i = 1; i < parts.length; i++) {
        const vParts = parts[i].split('.');
        if (vParts.length === 2) targetVars[vParts[0]] = vParts[1];
      }
    }

    // Определяем какие переменные являются сабкатегориями, а также сохраняем их для колонок
    let subcategoryVarIds = new Set();
    const variablesMap = {};
    if (gameId) {
      try {
        const varsRes = await fetch(`https://www.speedrun.com/api/v1/games/${gameId}/variables`);
        const varsData = await varsRes.json();
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
    let varsQuery = '';
    const strictVars = {};

    for (const [vId, vVal] of Object.entries(targetVars)) {
      if (subcategoryVarIds.has(vId) || (!referenceRunLink && xParam)) {
        strictVars[vId] = vVal;
        varsQuery += `&var-${vId}=${vVal}`;
      }
    }

    // 2. Fetch Rejected Runs (we fetch up to 5 pages since SR API ignores vars for rejected runs)
    updateStatus('(Ищем раны...)', '#aaa');
    const pagesToFetch = [0, 200, 400, 600, 800];
    const fetchPromises = pagesToFetch.map(async offset => {
        try {
            const res = await fetch(`https://www.speedrun.com/api/v1/runs?status=rejected&game=${gameId}${categoryQuery}${varsQuery}&max=200&offset=${offset}&embed=players,platform,category`);
            const data = await res.json();
            return data.data || [];
        } catch(e) { return []; }
    });
    
    const results = await Promise.all(fetchPromises);
    const allFetchedRuns = [];
    results.forEach(batch => allFetchedRuns.push(...batch));

    // 3. Строгая локальная фильтрация (API иногда игнорирует параметры или выдает дефолтные)
    let runs = allFetchedRuns.filter(r => {
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
      updateStatus('(Отклоненных ранов нет)');
      return;
    }

    rejectedDataCache = runs;
    updateStatus(`(Встроено: ${runs.length})`);

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
      tr.style.backgroundColor = 'rgba(255, 50, 50, 0.1)';
      tr.style.cursor = 'pointer';
      tr.title = 'Причина отказа: ' + (run.status.reason || 'Не указана');
      tr.onclick = () => window.open(run.weblink, '_blank');
      
      tr.onmouseenter = () => tr.style.backgroundColor = 'rgba(255, 50, 50, 0.2)';
      tr.onmouseleave = () => tr.style.backgroundColor = 'rgba(255, 50, 50, 0.1)';

      const timeT = run.times.primary_t || 0;
      tr.dataset.time_t = timeT;

      const rankHTML = '<span style="background:#ff3333;color:white;padding:2px 4px;border-radius:4px;font-size:10px;font-weight:bold;">REJC</span>';
      
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
           playersHTMLList.push(`<span style="white-space:nowrap; display: inline-flex; align-items: center;">${flagHTML}<span style="color:#d44242; font-weight:bold;">${name}</span></span>`);
        });
      }
      if (playersHTMLList.length === 0) playersHTMLList.push('<span style="color:#d44242;">Unknown</span>');
      
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
        }
        
        td.innerHTML = cellContents[i];
        
        // Центрируем все колонки кроме игрока
        if (typeof cellContents[i] !== 'string' || !cellContents[i].includes('color:#d44242;')) {
           td.style.textAlign = 'center';
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
    applyFilterMode(); // Прячем/показываем строки согласно текущему режиму

  } catch (error) {
    console.error(error);
    updateStatus('(Ошибка загрузки API)');
  } finally {
    isFetchingRuns = false;
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
    const table = document.querySelector('table');
    if (table) delete table.dataset.rrObserved;
  }
}, 1000);
