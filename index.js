const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  try {
    const browser = await puppeteer.launch({
      headless: true,  // modo headless para servidores
      args: [
        '--no-sandbox',               // necessário no Render e outros servidores
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',   // ajuda em ambientes limitados
      ],
    });

    const page = await browser.newPage();

    console.log('🔐 Acessando Instagram...');
    await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2' });

    // Exemplo: Espera 10 segundos para garantir carregamento
    await delay(10000);

    console.log('✅ Página carregada, você pode colocar seu código aqui');

    // Aqui você continua seu fluxo, login, inbox, etc...

    // Só pra demo: fecha o browser após 30 segundos
    await delay(30000);
    await browser.close();

  } catch (error) {
    console.error('Erro fatal:', error);
  }
})();
