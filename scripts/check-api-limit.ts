import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../api/', import.meta.url));
const entries = readdirSync(directory, { recursive: true, encoding: 'utf8' })
  .filter(name => /\.(?:[cm]?[jt]s|py|go|rb)$/.test(name) && !name.endsWith('.d.ts'));
if (entries.length > 12) {
  throw new Error(`Vercel Hobby: ${entries.length} funções em api/; máximo permitido pelo projeto: 12. Consolide rotas antes de publicar.`);
}
console.log(`Vercel: ${entries.length}/12 funções de API. Plano atual preservado.`);
