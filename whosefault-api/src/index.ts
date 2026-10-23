import { createServer } from './http/server.js';

import { GeminiTitleGenerator } from './infra/ai/geminiTitleGenerator.js';

const app = createServer({
    titleGenerator: new GeminiTitleGenerator(),
});
const port = Number(process.env.PORT) || 3333;
const host = process.env.HOST || '0.0.0.0';

try {
    await app.listen({ port, host });
    console.log(`🚀 WhoseFault API rodando em http://localhost:${port}`);
} catch (err) {
    app.log.error(err);
    process.exit(1);
}