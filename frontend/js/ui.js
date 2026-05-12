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

  function selectedLabel(select) {
    const selected = select?.options?.[select.selectedIndex];
    return selected && selected.value !== '' ? optionLabel(selected) : (select?.dataset.placeholder || optionLabel(selected) || 'Selecionar');
  }

  function renderDropdownItems(select, menu, search = '') {
    const options = Array.from(select.options || []);
    const scored = options
      .map(option => ({ option, score: fuzzyScore(search, `${optionLabel(option)} ${option.value}`) }))
      .filter(item => !search || item.score > 0)
      .sort((a, b) => b.score - a.score);

    menu.innerHTML = (scored.length ? scored : options).map(({ option }) => `
      <button type="button" class="app-select-option${option.value === select.value ? ' is-selected' : ''}" data-value="${option.value}">
        <span>${optionLabel(option)}</span>
      </button>
    `).join('');
  }

  function closeDropdown(wrapper) {
    wrapper?.classList.remove('is-open');
    const menu = wrapper?.querySelector('.app-select-menu');
    if (menu) menu.hidden = true;
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

    const wrapper = document.createElement('div');
    wrapper.className = `app-select ${options.className || ''}`.trim();
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'app-select-button';
    const menu = document.createElement('div');
    menu.className = 'app-select-menu';
    menu.hidden = true;
    menu.innerHTML = '<input class="app-select-search" type="search" autocomplete="off" placeholder="Pesquisar..."><div class="app-select-options"></div>';

    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);
    wrapper.appendChild(button);
    wrapper.appendChild(menu);

    const search = menu.querySelector('.app-select-search');
    const list = menu.querySelector('.app-select-options');
    const updateButton = () => { button.textContent = selectedLabel(select); };
    const open = () => {
      document.querySelectorAll('.app-select.is-open').forEach(node => {
        if (node !== wrapper) closeDropdown(node);
      });
      wrapper.classList.add('is-open');
      menu.hidden = false;
      search.value = '';
      renderDropdownItems(select, list);
      search.focus({ preventScroll: true });
    };

    button.addEventListener('click', event => {
      event.stopPropagation();
      wrapper.classList.contains('is-open') ? closeDropdown(wrapper) : open();
    });
    search.addEventListener('input', () => renderDropdownItems(select, list, search.value));
    menu.addEventListener('mousedown', event => event.preventDefault());
    menu.addEventListener('click', event => {
      const item = event.target.closest('.app-select-option');
      if (!item) return;
      select.value = item.dataset.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      updateButton();
      closeDropdown(wrapper);
    });
    select.addEventListener('change', updateButton);

    select._appSelectApi = {
      refresh() {
        updateButton();
        renderDropdownItems(select, list, search.value);
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
      });
    });
  }

  function refreshSelect(select) {
    select?._appSelectApi?.refresh();
  }

  function refreshDropdowns(root = document) {
    root.querySelectorAll('select[data-app-select="1"]').forEach(refreshSelect);
  }

  function openModal(target) {
    const modal = typeof target === 'string' ? document.getElementById(target) : target;
    if (!modal) return;
    modal.classList.add('open');
    document.body.classList.add('modal-open');
  }

  function closeModal(target) {
    const modal = typeof target === 'string' ? document.getElementById(target) : target;
    if (!modal) return;
    modal.classList.remove('open');
    document.body.classList.remove('modal-open');
  }

  document.addEventListener('click', event => {
    if (!event.target.closest('.app-select')) {
      document.querySelectorAll('.app-select.is-open').forEach(closeDropdown);
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      document.querySelectorAll('.app-select.is-open').forEach(closeDropdown);
      const openModalEl = document.querySelector('.modal-bg.open, .image-lightbox.open');
      if (openModalEl) closeModal(openModalEl);
    }
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
