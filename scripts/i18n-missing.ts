import { cs } from '../src/i18n/cs';
import { requiredKeys } from './i18n-keys';

const need = requiredKeys();
const missing = [...need.keys()].filter((k) => !(k in cs)).sort();
console.log(missing.length ? missing.map((k) => `${k}   <- ${need.get(k)}`).join('\n') : 'ALL KEYS PRESENT');
console.log(`\nrequired: ${need.size}, missing: ${missing.length}`);
