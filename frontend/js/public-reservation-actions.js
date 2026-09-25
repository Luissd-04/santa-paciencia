// Estado privado; interface partilhada em AppModules.booking.
(() => {
// Ações da página; argumentos dinâmicos são dados, nunca código.

AppActions.register({
  "public-reservation-apply-voucher-ed3c7bd": (el, event, args) => { AppModules.booking.applyVoucher() },
}, "click");

})();
