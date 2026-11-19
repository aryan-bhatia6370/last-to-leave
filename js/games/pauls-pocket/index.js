import { GAMES } from '../registry.js';
import { createPaulsPocket } from './game.js';

export default {
  id: 'pauls-pocket',
  name: "Paul's Pocket",
  tagline: 'Pick a marker. Paul scrambles his pocket. Pray.',
  goText: 'Pick!',
  passText: 'Paul pulled your marker!',
  failText: 'Wrong marker. Unlucky.',
  howTo: [
    'Paul holds out all 8 markers. <strong>Click or tap the one you want</strong> (on phones, use the color buttons).',
    'He stuffs them all in his khaki pocket and scrambles them around.',
    'He pulls one out. If it\'s yours, you survive.',
    'Pure luck: a 1 in 8 chance.',
  ],
  options: [],
  variants: GAMES.find((g) => g.id === 'pauls-pocket').variants,
  statLabels: [
    ['picked', 'You picked'],
    ['pulled', 'Paul pulled'],
  ],
  variant() { return 'regular'; },
  create: createPaulsPocket,
};
