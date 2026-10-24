import { initSite } from '../lib/site.js';
import '../styles/pages/research.css';
import { initPaperPage } from '../research/paper-page.js';
import { initDataflow } from '../research/dataflow.js';

initSite();
initPaperPage('covariance', 'covariance');
initDataflow();
