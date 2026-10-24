// Home page: intro, WebGL hero, and the scroll moments below it.
import { initSite } from '../lib/site.js';
import '../styles/pages/home.css';
import { playIntro } from '../home/intro.js';
import { initHero } from '../home/hero.js';
import { initManifesto, initPlatforms, initStack, initUseCases } from '../home/sections.js';

initSite();

const introDone = playIntro();
// Pinned sections are created in page order so ScrollTrigger measures their spacing correctly.
initHero(introDone);
initManifesto();
initPlatforms();
initStack();
initUseCases();
