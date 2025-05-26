const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Carrega respostas de vários arquivos txt
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

// Busca resposta no mapa com base na mensagem recebida
function buscarResposta(mensagem, mapaRespostas) {
  const mensagemLower = mensagem.toLowerCase();
  for (const chave in mapaRespostas) {
    if (mensagemLower.includes(chave)) {
      return mapaRespostas[chave];
    }
  }
  return null;
}

// Digita o texto devagar no input para parecer humano
async function digitarDevagar(elementHandle, texto) {
  for (const char of texto) {
    await elementHandle.type(char);
    await delay(100 + Math.random() * 100);
  }
}

// Carrega histórico de mensagens respondidas para evitar repetições
function carregarRespondidos() {
  try {
    const data = fs.readFileSync('./respondidos.json', 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

// Salva histórico de mensagens respondidas
function salvarRespondidos(obj) {
  fs.writeFileSync('./respondidos.json', JSON.stringify(obj, null, 2));
}

(async () => {
  // Lê caminho do Chromium instalado via variável de ambiente
  const chromiumPath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';

  const browser = await puppeteer.launch({
    headless: true,  // modo sem UI, mude para false para depurar localmente
    executablePath: chromiumPath,
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized']
  });

  const page = await browser.newPage();

  // Lê cookies salvos para autenticação (crie esse arquivo com cookies válidos)
  const cookies = JSON.parse(fs.readFileSync('./cookies.json', 'utf8'));
  await page.setCookie(...cookies);

  console.log('🔐 Acessando o Instagram feed...');
  await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2' });
  await delay(7000);

  console.log('⏳ Acessando a inbox...');
  await page.goto('https://www.instagram.com/direct/inbox/', { waitUntil: 'networkidle2' });
  await delay(10000);

  console.log('🔄 Iniciando monitoramento contínuo...');

  // Lista dos arquivos com respostas
  const arquivosDeRespostas = ['./respostas.txt', './respostasExtras.txt', './respostasMarketing.txt'];
  const mapaRespostas = carregarRespostasDeArquivos(arquivosDeRespostas);

  while (true) {
    try {
      const dadosIA = JSON.parse(fs.readFileSync('./chat.json', 'utf8'));
      const nomesChats = dadosIA.naoRespondidos;

      const respondidos = carregarRespondidos();

      for (const nome of nomesChats) {
        console.log(`🔎 Procurando chat com: ${nome}`);

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

        // Captura mensagens do chat
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

        // Busca resposta no mapa
        const resposta = buscarResposta(ultimaMensagem, mapaRespostas);

        if (!resposta) {
          console.log(`⚠️ Nenhuma resposta configurada para a mensagem: "${ultimaMensagem}". Pulando...`);
          continue;
        }

        // Envia resposta no chat
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

        // Atualiza respondidos para não repetir resposta para mesma mensagem
        respondidos[nome] = ultimaMensagem;
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
