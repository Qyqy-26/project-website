(function () {
  'use strict';

  var form = document.querySelector('[data-booking-form]');
  if (!form) return;

  var summary = form.querySelector('[data-booking-summary]');
  var subtotalNode = form.querySelector('[data-sum-subtotal]');
  var discountNode = form.querySelector('[data-sum-discount]');
  var feeNode = form.querySelector('[data-sum-fee]');
  var totalNode = form.querySelector('[data-sum-total]');
  var radios = form.querySelectorAll('input[name="sessions"]');
  var formatter = new Intl.NumberFormat('id-ID');

  function rupiah(value) {
    return 'Rp ' + formatter.format(Math.round(Number(value) || 0));
  }

  function sync() {
    var selected = form.querySelector('input[name="sessions"]:checked');
    if (!selected || !summary) return;

    form.querySelectorAll('.package-option').forEach(function (option) {
      option.classList.toggle('is-selected', option.contains(selected));
    });

    var subtotal = Number(selected.getAttribute('data-subtotal'));
    var discount = Number(selected.getAttribute('data-discount'));
    var fee = Number(selected.getAttribute('data-fee'));
    var total = Number(selected.getAttribute('data-total'));

    if (subtotalNode) subtotalNode.textContent = rupiah(subtotal);
    if (discountNode) discountNode.textContent = discount > 0 ? '- ' + rupiah(discount) : '—';
    if (feeNode) feeNode.textContent = rupiah(fee);
    if (totalNode) totalNode.textContent = rupiah(total);
  }

  radios.forEach(function (radio) {
    radio.addEventListener('change', sync);
  });

  sync();
})();
