// Escolher uma data no calendário da aplicação (AppDatePicker) num teste de
// browser: abre pelo campo, navega ano → mês → dia, como uma pessoa faria.
async function chooseDate(page, input, iso) {
  await input.click();
  const calendar = page.getByRole('dialog', { name: 'Calendário' });
  await calendar.locator('[data-nav="to-months"]').click();
  await calendar.locator('[data-nav="to-years"]').click();
  const year = Number(iso.slice(0, 4));
  while (!await calendar.locator(`[data-year="${year}"]`).count()) {
    const first = Number(await calendar.locator('[data-year]').first().getAttribute('data-year'));
    await calendar.locator(`[data-nav="${year < first ? 'pyp' : 'nyp'}"]`).click();
  }
  await calendar.locator(`[data-year="${year}"]`).click();
  await calendar.locator(`[data-month="${Number(iso.slice(5, 7)) - 1}"]`).click();
  await calendar.locator(`[data-iso="${iso}"]`).click();
}

module.exports = { chooseDate };
