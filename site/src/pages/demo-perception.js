// Temporary test page for the perception demos (yolo-detect, asf-fusion, sensor-montage).
// `?solo=<demo>&opts=<json>` renders a single demo, which the screenshot scripts use.
import { initSite } from '../lib/site.js';

const params = new URLSearchParams(location.search);
const solo = params.get('solo');
if (solo) {
  const main = document.getElementById('main');
  main.innerHTML = `<section class="section section--tight${params.get('paper') ? ' section--paper' : ''}"><div class="container"><div data-demo="${solo}"></div></div></section>`;
  main.querySelector('[data-demo]').dataset.options = params.get('opts') || '{}';
}

initSite();
