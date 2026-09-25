// Estado privado; interface partilhada em AppModules.core.
(() => {
(function () {
  function fuzzyScore(search, text) {
    const q = String(search || '').trim().toLowerCase();
    const value = String(text || '').toLowerCase();
    if (!q) return 1;
    if (value.startsWith(q)) return 4;
    if (value.includes(q)) return 3;
    let qi = 0;
    for (let i = 0; i < value.length && qi < q.length; i++) {
      if (value[i] === q[qi]) qi++;
    }
    return qi === q.length ? 2 : 0;
  }

  function setButtonLoading(button, loading, label) {
    if (!button) return;
    if (loading) {
      if (!button.dataset.idleHtml) button.dataset.idleHtml = button.innerHTML;
      button.disabled = true;
      button.classList.add('is-loading');
      button.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span>${label || 'A processar...'}`;
      return;
    }
    button.disabled = false;
    button.classList.remove('is-loading');
    if (button.dataset.idleHtml) {
      button.innerHTML = button.dataset.idleHtml;
      delete button.dataset.idleHtml;
    }
    if (window.lucide) lucide.createIcons();
  }

  function showElement(element, display = '') {
    if (element) element.style.display = display;
  }

  function hideElement(element) {
    if (element) element.style.display = 'none';
  }

  function optionLabel(option) {
    return option?.textContent?.trim() || option?.label || option?.value || '—';
  }

  // Bandeira opcional numa <option> via data-flag="pt" (código ISO). Como o
  // <option> nativo não renderiza HTML, a bandeira SVG só aparece na versão
  // .app-select (dropdown custom). Ver flagHtml() em helpers.js.
  function optionFlagCc(option) {
    const cc = String(option?.dataset?.flag || '').trim().toLowerCase();
    return /^[a-z]{2}$/.test(cc) ? cc : '';
  }

  function optionLabelHtml(option) {
    const text = (typeof AppModules.core.escapeHtml === 'function' ? AppModules.core.escapeHtml(optionLabel(option)) : optionLabel(option));
    const cc = optionFlagCc(option);
    return cc && typeof AppModules.core.flagHtml === 'function' ? `${AppModules.core.flagHtml(cc, { size: 18 })} ${text}` : text;
  }

  function selectedLabel(select) {
    const selected = select?.options?.[select.selectedIndex];
    return selected && selected.value !== '' ? optionLabel(selected) : (select?.dataset.placeholder || optionLabel(selected) || 'Selecionar');
  }

  function selectedLabelHtml(select) {
    const selected = select?.options?.[select.selectedIndex];
    if (selected && selected.value !== '') return optionLabelHtml(selected);
    const text = select?.dataset.placeholder || optionLabel(selected) || 'Selecionar';
    return typeof AppModules.core.escapeHtml === 'function' ? AppModules.core.escapeHtml(text) : text;
  }

  function renderDropdownItems(select, menu, search = '') {
    const options = Array.from(select.options || []);
    const scored = options
      .map(option => ({ option, score: fuzzyScore(search, `${optionLabel(option)} ${option.value}`) }))
      .filter(item => !search || item.score > 0)
      .sort((a, b) => b.score - a.score);

    const escape = value => typeof AppModules.core.escapeHtml === 'function' ? AppModules.core.escapeHtml(value) : String(value ?? '');
    menu.innerHTML = (scored.length ? scored : options).map(({ option }, index) => `
      <button type="button" role="option" tabindex="-1" aria-selected="${option.value === select.value}" class="app-select-option${option.value === select.value ? ' is-selected' : ''}" data-option-index="${index}" data-value="${escape(option.value)}"${option.disabled ? ' disabled' : ''}>
        <span>${optionLabelHtml(option)}</span>
      </button>
    `).join('');
  }

  function closeDropdown(wrapper) {
    wrapper?.classList.remove('is-open');
    wrapper?.classList.remove('app-select--drop-up');
    const button = wrapper?.querySelector('.app-select-button');
    if (button) button.setAttribute('aria-expanded', 'false');
    const menu = wrapper?.querySelector('.app-select-menu');
    if (menu) menu.hidden = true;
  }

  // Decide se o menu abre para baixo (padrão) ou para cima, consoante o
  // espaço disponível no ecrã — evita que o dropdown fique cortado quando
  // o botão está perto do fundo do ecrã ou de uma bottom sheet.
  function positionMenu(wrapper, menu) {
    wrapper.classList.remove('app-select--drop-up');
    const buttonRect = wrapper.getBoundingClientRect();
    const menuHeight = menu.offsetHeight || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const spaceBelow = viewportHeight - buttonRect.bottom;
    const spaceAbove = buttonRect.top;
    if (menuHeight > spaceBelow && spaceAbove > spaceBelow) {
      wrapper.classList.add('app-select--drop-up');
    }
  }

  function enhanceSelect(select, options = {}) {
    if (!select || select.dataset.appSelect === '1') {
      if (select?.dataset.appSelect === '1') refreshSelect(select);
      return select?._appSelectApi || null;
    }

    select.dataset.appSelect = '1';
    if (options.placeholder || select.dataset.placeholder) {
      select.dataset.placeholder = options.placeholder || select.dataset.placeholder;
    }
    select.classList.add('app-native-select');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');

    const wrapper = document.createElement('div');
    wrapper.className = `app-select ${options.className || ''}`.trim();
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'app-select-button';
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', 'false');
    const menu = document.createElement('div');
    menu.className = 'app-select-menu';
    menu.hidden = true;
    menu.innerHTML = options.noSearch
      ? '<div class="app-select-options"></div>'
      : '<input class="app-select-search" type="search" autocomplete="off" placeholder="Pesquisar..."><div class="app-select-options"></div>';

    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);
    wrapper.appendChild(button);
    wrapper.appendChild(menu);

    const search = menu.querySelector('.app-select-search');
    const list = menu.querySelector('.app-select-options');
    const listId = `app-select-list-${Math.random().toString(36).slice(2, 10)}`;
    list.id = listId;
    list.setAttribute('role', 'listbox');
    button.setAttribute('aria-controls', listId);
    const labelText = select.labels?.[0]?.textContent?.trim() || select.getAttribute('aria-label') || 'Selecionar opção';
    const updateButton = () => {
      button.innerHTML = selectedLabelHtml(select);
      button.disabled = select.disabled;
      button.setAttribute('aria-label', `${labelText}: ${selectedLabel(select)}`);
    };
    const optionButtons = () => Array.from(list.querySelectorAll('.app-select-option:not([disabled])'));
    const focusOption = index => {
      const items = optionButtons();
      if (!items.length) return;
      items[Math.max(0, Math.min(index, items.length - 1))].focus({ preventScroll: true });
    };
    const open = ({ focusSelected = false } = {}) => {
      document.querySelectorAll('.app-select.is-open').forEach(node => {
        if (node !== wrapper) closeDropdown(node);
      });
      wrapper.classList.add('is-open');
      button.setAttribute('aria-expanded', 'true');
      menu.hidden = false;
      if (search) search.value = '';
      renderDropdownItems(select, list);
      positionMenu(wrapper, menu);
      if (search && !focusSelected) search.focus({ preventScroll: true });
      else {
        const items = optionButtons();
        const selectedIndex = items.findIndex(item => item.getAttribute('aria-selected') === 'true');
        focusOption(selectedIndex >= 0 ? selectedIndex : 0);
      }
    };

    button.addEventListener('click', event => {
      event.stopPropagation();
      wrapper.classList.contains('is-open') ? closeDropdown(wrapper) : open();
    });
    search?.addEventListener('input', () => renderDropdownItems(select, list, search.value));
    search?.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); focusOption(0); }
      if (event.key === 'Escape') { event.preventDefault(); closeDropdown(wrapper); button.focus(); }
    });
    button.addEventListener('keydown', event => {
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        if (!wrapper.classList.contains('is-open')) open({ focusSelected: true });
        else focusOption(event.key === 'ArrowDown' ? 0 : optionButtons().length - 1);
      }
      if (event.key === 'Escape' && wrapper.classList.contains('is-open')) {
        event.preventDefault(); closeDropdown(wrapper);
      }
    });
    menu.addEventListener('mousedown', event => event.preventDefault());
    menu.addEventListener('click', event => {
      const item = event.target.closest('.app-select-option');
      if (!item) return;
      select.value = item.dataset.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      updateButton();
      closeDropdown(wrapper);
      button.focus({ preventScroll: true });
    });
    menu.addEventListener('keydown', event => {
      const item = event.target.closest('.app-select-option');
      if (!item) return;
      const items = optionButtons();
      const index = items.indexOf(item);
      if (event.key === 'ArrowDown') { event.preventDefault(); focusOption(index + 1); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); focusOption(index - 1); }
      else if (event.key === 'Home') { event.preventDefault(); focusOption(0); }
      else if (event.key === 'End') { event.preventDefault(); focusOption(items.length - 1); }
      else if (event.key === 'Escape') { event.preventDefault(); closeDropdown(wrapper); button.focus(); }
      else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); item.click(); }
    });
    select.addEventListener('change', updateButton);

    select._appSelectApi = {
      refresh() {
        updateButton();
        renderDropdownItems(select, list, search?.value || '');
      },
      open,
      close: () => closeDropdown(wrapper),
    };
    updateButton();
    return select._appSelectApi;
  }

  function enhanceSelects(root = document, selector = 'select[data-enhance-select]') {
    root.querySelectorAll(selector).forEach(select => {
      enhanceSelect(select, {
        placeholder: select.dataset.appSelectPlaceholder || select.dataset.placeholder,
        className: select.dataset.appSelectClass || '',
        noSearch: select.dataset.appSelectNosearch === '1',
      });
    });
  }

  function refreshSelect(select) {
    select?._appSelectApi?.refresh();
  }

  function refreshDropdowns(root = document) {
    root.querySelectorAll('select[data-app-select="1"]').forEach(refreshSelect);
  }

  const modalState = new WeakMap();
  const activeModals = [];
  let generatedDialogId = 0;
  const focusableSelector = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  function modalIsOpen(modal) {
    if (!modal) return false;
    if (modal.classList.contains('open') || modal.classList.contains('active')) return true;
    return modal.style.display && modal.style.display !== 'none';
  }

  function modalFocusable(modal) {
    return Array.from(modal.querySelectorAll(focusableSelector)).filter(element =>
      !element.hidden && element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0
    );
  }

  function setOutsideInert(modal) {
    const changed = [];
    let branch = modal;
    while (branch?.parentElement) {
      Array.from(branch.parentElement.children).forEach(sibling => {
        if (sibling === branch || sibling.tagName === 'SCRIPT') return;
        changed.push({ element: sibling, inert: sibling.inert });
        sibling.inert = true;
      });
      branch = branch.parentElement;
    }
    return changed;
  }

  function prepareModal(modal) {
    if (!modal.hasAttribute('role')) modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    if (!modal.hasAttribute('tabindex')) modal.setAttribute('tabindex', '-1');
    const title = modal.querySelector('.modal-title, h1, h2, h3');
    if (title && !modal.hasAttribute('aria-labelledby') && !modal.hasAttribute('aria-label')) {
      if (!title.id) title.id = `dialog-title-${++generatedDialogId}`;
      modal.setAttribute('aria-labelledby', title.id);
    } else if (!title && !modal.hasAttribute('aria-label')) {
      modal.setAttribute('aria-label', 'Diálogo');
    }
  }

  function activateModal(modal) {
    if (!modal || modalState.has(modal)) return;
    prepareModal(modal);
    modal.setAttribute('aria-hidden', 'false');
    modalState.set(modal, {
      previousFocus: document.activeElement,
      inertElements: setOutsideInert(modal),
    });
    activeModals.push(modal);
    document.body.classList.add('modal-open');
    const focus = () => (modalFocusable(modal)[0] || modal).focus({ preventScroll: true });
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(focus);
    else setTimeout(focus, 0);
  }

  function deactivateModal(modal) {
    const state = modalState.get(modal);
    modal.setAttribute('aria-hidden', 'true');
    if (!state) return;
    state.inertElements.forEach(({ element, inert }) => { element.inert = inert; });
    modalState.delete(modal);
    const index = activeModals.lastIndexOf(modal);
    if (index >= 0) activeModals.splice(index, 1);
    document.body.classList.toggle('modal-open', activeModals.length > 0);
    if (state.previousFocus?.isConnected && typeof state.previousFocus.focus === 'function') {
      state.previousFocus.focus({ preventScroll: true });
    }
  }

  function syncModalState(modal) {
    if (modalIsOpen(modal)) activateModal(modal);
    else deactivateModal(modal);
  }

  function openModal(target) {
    const modal = typeof target === 'string' ? document.getElementById(target) : target;
    if (!modal) return;
    modal.classList.add('open');
    activateModal(modal);
  }

  function closeModal(target) {
    const modal = typeof target === 'string' ? document.getElementById(target) : target;
    if (!modal) return;
    modal.classList.remove('open');
    deactivateModal(modal);
  }

  document.querySelectorAll('.modal-bg, .image-lightbox').forEach(modal => {
    prepareModal(modal);
    if (!modalIsOpen(modal)) modal.setAttribute('aria-hidden', 'true');
  });
  if (typeof MutationObserver === 'function') {
    const modalObserver = new MutationObserver(records => {
      records.forEach(record => {
        if (record.type === 'childList') {
          record.addedNodes.forEach(node => {
            if (node.nodeType !== 1) return;
            const modals = node.matches?.('.modal-bg, .image-lightbox')
              ? [node]
              : Array.from(node.querySelectorAll?.('.modal-bg, .image-lightbox') || []);
            modals.forEach(modal => {
              prepareModal(modal);
              if (modalIsOpen(modal)) activateModal(modal);
              else modal.setAttribute('aria-hidden', 'true');
            });
          });
          return;
        }
        const modal = record.target.closest?.('.modal-bg, .image-lightbox');
        if (modal) syncModalState(modal);
      });
    });
    modalObserver.observe(document.body, {
      subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'],
    });
  }

  document.addEventListener('click', event => {
    if (!event.target.closest('.app-select')) {
      document.querySelectorAll('.app-select.is-open').forEach(closeDropdown);
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Tab' && activeModals.length) {
      const modal = activeModals.at(-1);
      const focusable = modalFocusable(modal);
      if (!focusable.length) {
        event.preventDefault();
        modal.focus();
      } else {
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }
    }
    if (event.key === 'Escape') {
      document.querySelectorAll('.app-select.is-open').forEach(closeDropdown);
      const openModalEl = document.querySelector('.modal-bg.open, .image-lightbox.open');
      if (openModalEl) {
        // O modal de reservas gere o seu próprio fecho (confirmação + rascunho).
        if (openModalEl.id === 'modal-bg' && typeof AppModules.reservas.requestCloseReservaModal === 'function') {
          AppModules.reservas.requestCloseReservaModal();
        } else {
          closeModal(openModalEl);
        }
      }
    }
  });

  // O Safari do iOS (sobretudo em PWA "adicionada ao ecrã principal") por
  // vezes fica preso num zoom depois de rodar o ecrã, porque o layout muda
  // a meio da transição de orientação e o WebKit não recalcula bem a escala.
  // Forçar um reset momentâneo do viewport corrige o zoom preso sem afetar
  // o pinch-zoom normal do utilizador no resto do tempo.
  window.addEventListener('orientationchange', () => {
    const viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) return;
    const original = viewport.getAttribute('content');
    viewport.setAttribute('content', original + ', maximum-scale=1.0');
    setTimeout(() => viewport.setAttribute('content', original), 350);
  });

  window.AppUI = {
    setButtonLoading,
    showElement,
    hideElement,
    enhanceSelect,
    enhanceSelects,
    refreshSelect,
    refreshDropdowns,
    openModal,
    closeModal,
  };
})();

})();
