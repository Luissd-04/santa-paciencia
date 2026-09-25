// Estado privado; interface partilhada em AppModules.demo.
(() => {
// Ações da página; argumentos dinâmicos são dados, nunca código.

AppActions.register({
  "test-reservation-test-render-3f5758e": (el, event, args) => { AppModules.demo.testRender() },
  "test-reservation-log-2ed4d5b": (el, event, args) => { console.log(AppModules.demo.state) },
  "test-reservation-reload-8890452": (el, event, args) => { location.reload() },
}, "click");

})();
