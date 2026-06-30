// nurr-mobile.js
// External mobile behavior layer for NURR.
// It does not replace or edit generator functions. It only manages responsive UI state.

(function () {
  const MOBILE_QUERY = '(max-width: 820px), (max-height: 650px)';

  function isMobile() {
    return window.matchMedia(MOBILE_QUERY).matches;
  }

  function setMobileClass() {
    document.body.classList.toggle('is-mobile-ui', isMobile());
    if (!isMobile()) document.body.classList.remove('mobile-panel-open');
  }

  function ensurePanelHandle() {
    const panel = document.querySelector('.panel');
    const header = document.querySelector('.panel-header');
    if (!panel || !header) return;

    if (!panel.querySelector('.mobile-panel-handle')) {
      const handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'mobile-panel-handle';
      handle.setAttribute('aria-label', 'Open or close controls');
      handle.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        document.body.classList.toggle('mobile-panel-open');
      });
      panel.appendChild(handle);
    }

    if (!header.dataset.mobileToggleBound) {
      header.dataset.mobileToggleBound = 'true';
      header.addEventListener('click', function (event) {
        if (!isMobile()) return;
        if (event.target.closest('.icon-btn, button, input, .swatch, .palette-card, .layout-card, .abstract-form-btn, .nature-thumb')) return;
        document.body.classList.toggle('mobile-panel-open');
      });
    }
  }

  function closePanelWhenUsingStage(event) {
    if (!isMobile()) return;
    if (event.target.closest('.panel, .rail, .color-wheel-card, .eyedropper-follow')) return;
    document.body.classList.remove('mobile-panel-open');
  }

  function updateViewportVars() {
    document.documentElement.style.setProperty('--nurr-vh', `${window.innerHeight * 0.01}px`);
  }

  function init() {
    setMobileClass();
    updateViewportVars();
    ensurePanelHandle();

    const observer = new MutationObserver(function () {
      ensurePanelHandle();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('resize', function () {
      setMobileClass();
      updateViewportVars();
      ensurePanelHandle();
    }, { passive: true });

    window.addEventListener('orientationchange', function () {
      setTimeout(function () {
        setMobileClass();
        updateViewportVars();
        ensurePanelHandle();
      }, 250);
    }, { passive: true });

    document.addEventListener('pointerdown', closePanelWhenUsingStage, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
