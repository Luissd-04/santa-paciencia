// Estado privado; interface partilhada em AppModules.demo.
(() => {
AppModules.define('demo', {
  state: { get: () => state },
  testRender: { get: () => testRender },
});


    const testImages = [
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=80',
      'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?auto=format&fit=crop&w=1600&q=80',
      'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1600&q=80',
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1600&q=80',
    ];

    const state = {
      property: {
        name: 'Quinta da Santa Paciência',
        images: testImages.map(url => ({ url }))
      },
      units: [
        { id: 'u1', name: 'Quarto Deluxe', price_per_night: 150, max_guests: 2, cover_image: testImages[0] },
        { id: 'u2', name: 'Suite Premium', price_per_night: 200, max_guests: 4, cover_image: testImages[1] },
      ],
      bookingType: 'unit',
      selectedUnitId: 'u1'
    };

    function testRender() {
      renderRail('gallery-top', testImages);
      renderRail('gallery-bottom', testImages.reverse());
      renderUnits();
      console.log('Teste renderizado com sucesso');
    }

    function renderRail(id, imgs) {
      const rail = document.getElementById(id);
      if (!imgs.length) return;
      const doubled = [...imgs, ...imgs, ...imgs, ...imgs].slice(0, Math.max(16, imgs.length * 3));
      rail.innerHTML = doubled.map(url => `<img class="rail-img" src="${url}" alt="" loading="lazy">`).join('');
      rail.style.animation = 'none';
      setTimeout(() => {
        rail.style.animation = '';
      }, 10);
      console.log(`Rail renderizado: ${doubled.length} imagens`);
    }

    function renderUnits() {
      const container = document.getElementById('unit-list');
      if (state.bookingType === 'property') {
        container.innerHTML = `
          <div class="unit-card selected property-card" data-unit="property">
            <img src="${state.property.images?.[0]?.url || ''}" alt="">
            <div>
              <h4>${state.property?.name || 'Alojamento completo'}</h4>
              <p>Toda a propriedade para sua exclusividade</p>
            </div>
          </div>`;
      } else {
        container.innerHTML = state.units.map(unit => `
          <div class="unit-card selected" data-unit="${unit.id}">
            <img src="${unit.cover_image}" alt="">
            <div>
              <h4>${unit.name}</h4>
              <p>${unit.max_guests} hóspedes</p>
            </div>
            <div class="unit-price">€${unit.price_per_night}<small>/ noite</small></div>
          </div>`).join('');
      }
      console.log('Unidades renderizadas');
    }

    document.getElementById('pb-booking-type').addEventListener('change', (e) => {
      state.bookingType = e.target.value;
      renderUnits();
      console.log('Tipo de reserva alterado:', state.bookingType);
    });

    // Renderizar no load
    testRender();
  
})();
