import { mountProductBands } from '../products/bands.js';
import { initSite } from '../lib/site.js';
import '../styles/pages/products.css';

mountProductBands({
  current: 'arms',
  title: 'Sees with the stack, <em>grasps with it too.</em>',
  body: '<p>Every Arm mount shares the same perception and grasp-planning modules from the Semantic Autonomy Stack, whether it rides on an Xplorer, works on a G1 or sits on a bench.</p>',
  layers: {
    L2: { note: 'Shared perception modules' },
    L0: { note: 'Arm on Xplorer, G1 or a fixed base', tag: '6-DOF' },
  },
  ctaTitle: 'Put a 6-DOF arm <em>to work.</em>',
  subject: 'SAIM Arm series',
});

initSite();
