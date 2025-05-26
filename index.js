const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ✅ NOVA FUNÇÃO: carrega respostas de vários arquivos txt
function carregarRespostasDeArquivos(arquivos) {
  const mapa = {};

  for (const arquivo of arquivos) {
    if (fs.existsSync(arquivo)) {
      const linhas = fs.readFileSync(arquivo, 'utf8')
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);

      for (const linha of linhas) {
        const [chave, resposta] = linha.split('=>').map(p => p.trim());
        if (chave && resposta) {
          mapa[chave.toLowerCase()] = resposta;
        }
      }
    } else {
      console.warn(`⚠️ Arquivo não encontrado: ${arquivo}`);
    }
  }

  return mapa;
}

// ✅ FUNÇÃO PARA BUSCAR RESPOSTA COM BASE NA MENSAGEM
function buscarResposta(mensagem, mapaRespostas) {
  const mensagemLower = mensagem.toLowerCase();
  for (const chave in mapaRespostas) {
    if (mensagemLower.includes(chave)) {
      return mapaRespostas[chave];
    }
  }
  return null;
}

async function digitarDevagar(elementHandle, texto) {
  for (const char of texto) {
    await elementHandle.type(char);
    await delay(100 + Math.random() * 100);
  }
}

function carregarRespondidos() {
  try {
    const data = fs.readFileSync('./respondidos.json', 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function salvarRespondidos(obj) {
  fs.writeFileSync('./respondidos.json', JSON.stringify(obj, null, 2));
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });

  const page = await browser.newPage();

  const cookies = JSON.parse(fs.readFileSync('./cookies.json'));
  await page.setCookie(...cookies);

  console.log('🔐 Acessando o Instagram feed...');
  await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2' });
  await delay(7000);

  console.log('⏳ Acessando a inbox...');
  await page.goto('https://www.instagram.com/direct/inbox/', { waitUntil: 'networkidle2' });
  await delay(10000);

  console.log('🔄 Iniciando monitoramento contínuo...');

  // ✅ Aqui você lista os arquivos que quer usar para carregar respostas
  const arquivosDeRespostas = ['./respostas.txt', './respostasExtras.txt', './respostasMarketing.txt'];
  const mapaRespostas = carregarRespostasDeArquivos(arquivosDeRespostas);

  while (true) {
    try {
      const dadosIA = JSON.parse(fs.readFileSync('./chat.json', 'utf8'));
      const nomesChats = dadosIA.naoRespondidos;

      const respondidos = carregarRespondidos();

      for (const nome of nomesChats) {
        console.log(`🔎 Procurando: ${nome}`);

        let encontrado = false;
        let tentativas = 0;

        while (!encontrado && tentativas < 10) {
          encontrado = await page.evaluate((nome) => {
            const spans = Array.from(document.querySelectorAll('span'));
            const alvo = spans.find(span => span.innerText.trim() === nome);
            if (alvo) {
              alvo.scrollIntoView();
              alvo.click();
              return true;
            }
            return false;
          }, nome);

          if (!encontrado) {
            await page.evaluate(() => {
              const container = document.querySelector('div[role="presentation"]');
              if (container) container.scrollBy(0, 500);
            });
            await delay(1500);
            tentativas++;
          }
        }

        if (!encontrado) {
          console.log(`❌ Não foi possível encontrar "${nome}" nos chats.`);
          continue;
        }

        console.log(`✅ Chat com "${nome}" aberto!`);
        await delay(4000);

        const mensagens = await page.evaluate(() => {
          const elementos = Array.from(document.querySelectorAll('div[dir="auto"].html-div'));
          return elementos.map(el => {
            return {
              texto: el.innerText.trim(),
              classes: el.className
            };
          });
        });

        if (mensagens.length === 0) {
          console.log(`⚠️ Não foi possível capturar mensagens de "${nome}". Pulando...`);
          continue;
        }

        const ultimaMensagem = mensagens[mensagens.length - 1].texto;

        console.log(`📝 Última mensagem de "${nome}": "${ultimaMensagem}"`);

        if (respondidos[nome] && respondidos[nome] === ultimaMensagem) {
          console.log(`⚠️ Já respondi essa mensagem para "${nome}". Pulando para próxima...`);
          continue;
        }

        // ✅ Busca resposta com base no mapa carregado de vários arquivos
        const resposta = buscarResposta(ultimaMensagem, mapaRespostas);

        if (!resposta) {
          console.log(`⚠️ Nenhuma resposta configurada para "${ultimaMensagem}". Pulando...`);
          continue;
        }

        const inputSelector = 'textarea, div[contenteditable="true"]';
        await page.waitForSelector(inputSelector, { visible: true });
        const input = await page.$(inputSelector);

        if (!input) {
          console.log(`⚠️ Campo de mensagem não encontrado para "${nome}". Pulando...`);
          continue;
        }

        console.log(`💬 Enviando resposta para "${nome}": ${resposta}`);

        await digitarDevagar(input, resposta);
        await page.keyboard.press('Enter');

        respondidos[nome] = ultimaMensagem;  // Salva a última mensagem respondida
        salvarRespondidos(respondidos);

        await delay(4000);
      }

    } catch (e) {
      console.error('Erro no loop principal:', e);
    }

    console.log('⏳ Aguardando 30 segundos para nova verificação...');
    await delay(30000);
  }
})();
