// Semantic Autonomy Stack page: sticky 3D stack story (L0 → L5), live reasoning flow, evidence and positioning.
import { initSite } from '../lib/site.js';
import '../styles/pages/stack.css';
import { initStory } from '../stack/story.js';
import { initBodies } from '../stack/bodies.js';
import { mountFlow } from '../stack/flow.js';

initSite();
initStory();
initBodies();

// The flow diagram mirrors the mission console that sits next to it.
const flowHost = document.querySelector('[data-flow]');
const journey = document.querySelector('.sas-journey__grid');
if (flowHost && journey) mountFlow(flowHost, journey);

// Mobile: a tiny six-bar stack in each layer header shows where the article sits in the stack.
document.querySelectorAll('.sas-layer').forEach((article) => {
  const i = Number(article.dataset.layer);
  const mini = document.createElement('span');
  mini.className = 'sas-mini';
  mini.setAttribute('aria-hidden', 'true');
  mini.innerHTML = [5, 4, 3, 2, 1, 0].map((k) => `<i class="${k === i ? 'is-on' : ''}"></i>`).join('');
  article.querySelector('.sas-layer__head')?.appendChild(mini);
});
