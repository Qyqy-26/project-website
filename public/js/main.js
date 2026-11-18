(function () {
  'use strict';

  var header = document.querySelector('[data-header]');
  if (header) {
    var onScroll = function () {
      header.classList.toggle('is-scrolled', window.scrollY > 8);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  var menu = document.querySelector('[data-mobile-menu]');
  var menuToggle = document.querySelector('[data-menu-toggle]');
  if (menu && menuToggle) {
    menuToggle.addEventListener('click', function () {
      var open = menu.classList.toggle('is-open');
      menuToggle.setAttribute('aria-expanded', String(open));
    });
    menu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        menu.classList.remove('is-open');
        menuToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  var sidebar = document.querySelector('[data-sidebar]');
  var scrim = document.querySelector('.sidebar-scrim');
  if (sidebar) {
    var setSidebar = function (open) {
      sidebar.classList.toggle('is-open', open);
      if (scrim) scrim.classList.toggle('is-visible', open);
      document.body.style.overflow = open ? 'hidden' : '';
    };
    document.querySelectorAll('[data-sidebar-open]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setSidebar(true);
      });
    });
    document.querySelectorAll('[data-sidebar-close]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setSidebar(false);
      });
    });
    if (scrim) {
      scrim.addEventListener('click', function () {
        setSidebar(false);
      });
    }
    sidebar.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        setSidebar(false);
      });
    });
    window.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') setSidebar(false);
    });
  }

  document.querySelectorAll('[data-flash]').forEach(function (flash) {
    var close = function () {
      flash.classList.add('is-leaving');
      window.setTimeout(function () {
        flash.remove();
      }, 260);
    };
    var button = flash.querySelector('.flash-close');
    if (button) button.addEventListener('click', close);
    window.setTimeout(close, 6500);
  });

  document.querySelectorAll('[data-password-toggle]').forEach(function (button) {
    button.addEventListener('click', function () {
      var input = button.parentElement.querySelector('[data-password-input]');
      if (!input) return;
      var isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      button.setAttribute('aria-label', isPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi');
    });
  });

  document.querySelectorAll('[data-fill-login]').forEach(function (button) {
    button.addEventListener('click', function () {
      var form = document.querySelector('form[action="/masuk"]');
      if (!form) return;
      var email = form.querySelector('input[name="email"]');
      var password = form.querySelector('input[name="password"]');
      if (email) email.value = button.getAttribute('data-email') || '';
      if (password) password.value = button.getAttribute('data-password') || '';
      if (password) password.focus();
    });
  });

  document.querySelectorAll('[data-copy]').forEach(function (button) {
    button.addEventListener('click', function () {
      var value = button.getAttribute('data-copy') || '';
      var original = button.innerHTML;
      var done = function () {
        button.innerHTML = 'Tersalin';
        window.setTimeout(function () {
          button.innerHTML = original;
        }, 1800);
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(value).then(done).catch(function () {
          fallbackCopy(value, done);
        });
      } else {
        fallbackCopy(value, done);
      }
    });
  });

  function fallbackCopy(value, done) {
    var area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand('copy');
      done();
    } catch (error) {
      /* clipboard unavailable */
    }
    document.body.removeChild(area);
  }

  document.querySelectorAll('[data-countdown]').forEach(function (node) {
    var target = new Date(node.getAttribute('data-countdown')).getTime();
    if (Number.isNaN(target)) return;
    var tick = function () {
      var diff = target - Date.now();
      if (diff <= 0) {
        node.textContent = 'Waktu pembayaran habis';
        return false;
      }
      var minutes = Math.floor(diff / 60000);
      var hours = Math.floor(minutes / 60);
      var days = Math.floor(hours / 24);
      var text;
      if (days > 0) {
        text = days + ' hari ' + (hours % 24) + ' jam';
      } else if (hours > 0) {
        text = hours + ' jam ' + (minutes % 60) + ' menit';
      } else {
        text = minutes + ' menit ' + Math.floor((diff % 60000) / 1000) + ' detik';
      }
      node.textContent = text;
      return true;
    };
    if (tick()) {
      var timer = window.setInterval(function () {
        if (!tick()) window.clearInterval(timer);
      }, 1000);
    }
  });

  document.querySelectorAll('form[data-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      if (!window.confirm(form.getAttribute('data-confirm'))) {
        event.preventDefault();
      }
    });
  });

})();
